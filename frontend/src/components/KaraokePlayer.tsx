import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import Soundfont from "soundfont-player";
import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";
import spessaWorkletUrl from "spessasynth_lib/dist/spessasynth_processor.min.js?url";
import { currentLrcIndex, parseLrc, type LrcLine } from "../lib/lrc";
import { extractMidiLyrics } from "../lib/midiLyrics";
import { gleitzNameForPatch } from "../lib/gmPatchToGleitz";
import { getSoundfontBank } from "../lib/soundfontBanks";
import type { SoundfontBankId } from "../lib/soundfontBanks";
import { midiNumberToName } from "../lib/midiNote";
import { buildPlaybackMidiBuffer, normalizeMutedTrack } from "../lib/midiMute";
import { STAGE_SHELL_CLASS, StageStartOverlay } from "./StageStartOverlay";
import { StageTransportBar } from "./StageTransportBar";

const base = import.meta.env.VITE_API_URL ?? "";
const CONTROLS_HIDE_MS = 3000;

/** I file .sf2 possono superare i 100MB: una sola fetch per sessione, condivisa tra i brani. */
const sf2Cache = new Map<string, Promise<ArrayBuffer>>();

function fetchSf2(file: string): Promise<ArrayBuffer> {
  const cached = sf2Cache.get(file);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(`${base}/api/media/sf2/${encodeURIComponent(file)}`);
    if (!res.ok) {
      throw new Error("SoundFont non presente sul server: caricalo da /admin → Coda live.");
    }
    return res.arrayBuffer();
  })();
  p.catch(() => sf2Cache.delete(file));
  sf2Cache.set(file, p);
  return p;
}

/**
 * Trasposizione live in SF2 via RPN Coarse Tuning (MIDI standard: CC101=0, CC100=2, CC6=64±n).
 * Vale per le note successive su tutti i canali melodici; il canale batteria (10) non si traspone.
 */
function sf2ControllerChange(synth: WorkletSynthesizer) {
  return synth.controllerChange.bind(synth) as (ch: number, controller: number, value: number) => void;
}

function sf2AllNotesOff(synth: WorkletSynthesizer) {
  const cc = sf2ControllerChange(synth);
  for (let ch = 0; ch < 16; ch++) {
    try {
      cc(ch, 123, 0);
    } catch {
      /* canale non disponibile */
    }
  }
}

function applySf2Transpose(synth: WorkletSynthesizer, semitones: number) {
  const cc = sf2ControllerChange(synth);
  const v = Math.max(0, Math.min(127, 64 + Math.round(semitones)));
  for (let ch = 0; ch < 16; ch++) {
    if (ch === 9) continue;
    try {
      cc(ch, 101, 0); // RPN MSB
      cc(ch, 100, 2); // RPN LSB → coarse tuning
      cc(ch, 6, v); // data entry: 64 = 0 semitoni
      cc(ch, 101, 127); // RPN null (evita che altri CC6 del file la tocchino)
      cc(ch, 100, 127);
    } catch {
      /* canale non disponibile */
    }
  }
}

type Controls = {
  pause: () => void;
  resume: () => void;
  restart: () => void;
  seek: (sec: number) => void;
};

type Props = {
  songId: string;
  title: string;
  artist: string;
  lrcPath?: string | null;
  /** Se omesso, usa il banco predefinito Fluid R3. */
  soundfontBankId?: SoundfontBankId | null;
  /**
   * Se valorizzato, il MIDI viene scaricato tramite proxy API (pagina /test-midi, demo esterne).
   * In quel caso `songId` non è usato per il fetch del MIDI (serve comunque per coerenza tipo).
   */
  remoteMidiUrl?: string | null;
  /** Fine naturale del brano: il display la usa per chiudere l'esibizione da solo. */
  onEnded?: () => void;
  /** Traccia MIDI da silenziare (1-based): la voce guida, di solito la 4. Modificabile anche live. */
  mutedTrack?: number | null;
  /** Trasposizione in semitoni (-12…+12). Modificabile live dalla console admin. */
  transposeSemitones?: number;
};

export function KaraokePlayer({
  songId,
  title,
  artist,
  lrcPath,
  soundfontBankId,
  remoteMidiUrl,
  onEnded,
  mutedTrack,
  transposeSemitones = 0,
}: Props) {
  const bankId = soundfontBankId ?? getSoundfontBank(null).id;
  const bank = getSoundfontBank(bankId);

  const midiUrl = remoteMidiUrl
    ? `${base}/api/test/midi-proxy?url=${encodeURIComponent(remoteMidiUrl)}`
    : `${base}/api/media/song/${encodeURIComponent(songId)}/midi`;
  const lrcUrl =
    lrcPath && !remoteMidiUrl ? `${base}/api/media/song/${encodeURIComponent(songId)}/lrc` : null;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [midi, setMidi] = useState<Midi | null>(null);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  /** Testi karaoke incorporati nel MIDI (meta FF05/FF01): fallback quando manca il file .lrc. */
  const [midiLyrics, setMidiLyrics] = useState<LrcLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [transportSec, setTransportSec] = useState(0);
  const [loadingSf, setLoadingSf] = useState(false);
  const [sfProgress, setSfProgress] = useState<{ done: number; total: number } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  const disposeRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const hideControlsTimerRef = useRef<number | null>(null);
  const midiBufRef = useRef<ArrayBuffer | null>(null);
  /** Sorgente del tempo di trasporto (per i testi): impostata dal motore di playback attivo. */
  const timeSourceRef = useRef<(() => number) | null>(null);
  /** Comandi play/pausa/riavvia del motore attivo. */
  const controlsRef = useRef<Controls | null>(null);
  /** Traccia silenziata corrente: modificabile dalla console anche a brano in corso. */
  const mutedRef = useRef<number | null>(normalizeMutedTrack(mutedTrack));
  /** Trasposizione corrente: la console può cambiarla anche a brano in corso. */
  const transposeRef = useRef<number>(transposeSemitones);
  /** Motore SF2 attivo: reload del file senza la traccia muta. */
  const sf2LiveRef = useRef<{ synth: WorkletSynthesizer; seq: Sequencer } | null>(null);
  /** Per il mute live in Gleitz: un GainNode per traccia (azzeramento immediato sul synth). */
  const gleitzLiveRef = useRef<{ ctx: AudioContext; gainOfTrack: Map<number, GainNode> } | null>(null);
  /** Player Gleitz per traccia (stop immediato al mute). */
  const gleitzPlayersRef = useRef<Map<number, Awaited<ReturnType<typeof Soundfont.instrument>>>>(new Map());
  /** Riprogramma le note Gleitz dal punto corrente (trasposizione/mute immediati). */
  const gleitzPumpRef = useRef<{ rescheduleFromNow: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error("MIDI non trovato");
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        midiBufRef.current = buf;
        const parsed = new Midi(buf);
        setMidi(parsed);
        try {
          setMidiLyrics(extractMidiLyrics(buf, parsed));
        } catch {
          setMidiLyrics([]);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Errore MIDI");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [midiUrl]);

  useEffect(() => {
    if (!lrcUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(lrcUrl);
        if (!res.ok) return;
        const text = await res.text();
        if (cancelled) return;
        setLrcLines(parseLrc(text));
      } catch {
        /* senza .lrc valgono i testi incorporati nel MIDI */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lrcUrl]);

  const reloadSf2ForMute = useCallback(
    (muted: number | null) => {
      const live = sf2LiveRef.current;
      const buf = midiBufRef.current;
      if (!live || !buf) return;
      const t = live.seq.currentTime;
      const wasPaused = live.seq.paused;
      const playbackBuf = buildPlaybackMidiBuffer(buf, muted);
      sf2AllNotesOff(live.synth);
      live.seq.loadNewSongList([{ binary: playbackBuf.slice(0), fileName: `${title}.mid` }]);
      live.seq.currentTime = t;
      if (transposeRef.current !== 0) {
        applySf2Transpose(live.synth, transposeRef.current);
        window.setTimeout(() => applySf2Transpose(live.synth, transposeRef.current), 600);
      }
      if (!wasPaused) live.seq.play();
    },
    [title]
  );

  const applyGleitzTrackMute = useCallback((prev: number | null, next: number | null) => {
    const gleitz = gleitzLiveRef.current;
    if (gleitz) {
      const t = gleitz.ctx.currentTime;
      for (const [trackIndex, gain] of gleitz.gainOfTrack) {
        const vol = trackIndex === next ? 0 : 1;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(vol, t);
      }
    }
    if (prev != null) {
      try {
        gleitzPlayersRef.current.get(prev)?.stop?.();
      } catch {
        /* ignore */
      }
    }
    if (next != null) {
      try {
        gleitzPlayersRef.current.get(next)?.stop?.();
      } catch {
        /* ignore */
      }
    }
    gleitzPumpRef.current?.rescheduleFromNow();
  }, []);

  // Mute live: la console può cambiare la traccia silenziata anche a brano in corso.
  useEffect(() => {
    const prev = mutedRef.current;
    const next = normalizeMutedTrack(mutedTrack);
    mutedRef.current = next;
    if (prev === next) return;

    if (sf2LiveRef.current) reloadSf2ForMute(next);
    if (gleitzLiveRef.current) applyGleitzTrackMute(prev, next);
  }, [mutedTrack, reloadSf2ForMute, applyGleitzTrackMute]);

  // Trasposizione live: SF2 via RPN; Gleitz riprogramma dal punto corrente (evita il ritardo LOOKAHEAD 8s).
  useEffect(() => {
    transposeRef.current = transposeSemitones;
    const live = sf2LiveRef.current;
    if (live) applySf2Transpose(live.synth, transposeSemitones);
    gleitzPumpRef.current?.rescheduleFromNow();
  }, [transposeSemitones]);

  const bumpControlsVisibility = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current != null) window.clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  /** Motore SF2: sintesi completa via spessasynth (batteria GM, program change, pitch bend). */
  const startSf2Playback = useCallback(async () => {
    const midiBuf = midiBufRef.current;
    const sf2File = bank.sf2File;
    if (!midi || !midiBuf || !sf2File) return;
    disposeRef.current?.();
    disposeRef.current = null;

    const ac = new AudioContext({ latencyHint: "playback" });
    setLoadingSf(true);
    try {
      await ac.resume();
      await ac.audioWorklet.addModule(spessaWorkletUrl);
      const synth = new WorkletSynthesizer(ac);
      synth.connect(ac.destination);
      // .slice(0): il worker può trasferire il buffer, la cache deve restare valida.
      const sfBuf = await fetchSf2(sf2File);
      await synth.soundBankManager.addSoundBank(sfBuf.slice(0), "main");
      await synth.isReady;

      // skipToFirstNoteOn falso: il tempo deve restare allineato ai timestamp dei testi.
      const seq = new Sequencer(synth, { skipToFirstNoteOn: false });
      seq.loopCount = 0;
      const playbackBuf = buildPlaybackMidiBuffer(midiBuf.slice(0), mutedRef.current);
      seq.loadNewSongList([{ binary: playbackBuf.slice(0), fileName: `${title}.mid` }]);
      seq.eventHandler.addEvent("songEnded", "karaoke-player-end", () => {
        setPlaying(false);
        setTransportSec(0);
        onEnded?.();
      });
      seq.play();

      // il transpose va applicato DOPO l'avvio: i controller-reset iniziali del file lo cancellerebbero
      if (transposeRef.current !== 0) {
        applySf2Transpose(synth, transposeRef.current);
        window.setTimeout(() => applySf2Transpose(synth, transposeRef.current), 600);
      }

      sf2LiveRef.current = { synth, seq };

      timeSourceRef.current = () => Math.max(0, seq.currentHighResolutionTime);
      controlsRef.current = {
        pause: () => seq.pause(),
        resume: () => seq.play(),
        restart: () => {
          seq.currentTime = 0;
          seq.play();
        },
        seek: (sec: number) => {
          seq.currentTime = Math.max(0, sec);
        },
      };
      setLoadingSf(false);
      setPaused(false);
      setPlaying(true);
      bumpControlsVisibility();

      disposeRef.current = () => {
        sf2LiveRef.current = null;
        controlsRef.current = null;
        try {
          seq.pause();
        } catch {
          /* già fermo */
        }
        try {
          synth.destroy();
        } catch {
          /* già distrutto */
        }
        void ac.close().catch(() => {});
      };
    } catch (e) {
      setLoadingSf(false);
      setLoadError(e instanceof Error ? e.message : "Errore caricamento SoundFont");
      void ac.close().catch(() => {});
    }
  }, [midi, bank.sf2File, title, onEnded, bumpControlsVisibility]);

  /**
   * Motore Gleitz (campioni mp3 pre-renderizzati): AudioContext puro con programmazione
   * a finestra scorrevole (~8s) — schedulare tutte le note insieme saturava il thread audio.
   * Limite noto: niente percussioni (i banchi Gleitz non hanno i drum kit; col banco SF2 ci sono).
   */
  const startGleitzPlayback = useCallback(async () => {
    if (!midi) return;
    disposeRef.current?.();
    disposeRef.current = null;

    const ac = new AudioContext({ latencyHint: "playback" });
    setLoadingSf(true);
    setSfProgress(null);

    const players = new Map<string, Awaited<ReturnType<typeof Soundfont.instrument>>>();
    const cleanupAc = () => void ac.close().catch(() => {});

    try {
      await ac.resume();

      const folder = bank.gleitzFolder;
      const nameToUrl = (name: string, _sf: string, format: string) => {
        const fmt = format === "ogg" ? "ogg" : "mp3";
        return `${base}/api/media/soundfont/${encodeURIComponent(folder)}/${encodeURIComponent(`${name}-${fmt}.js`)}`;
      };

      // Tracce melodiche riproducibili (Gleitz non ha kit batteria GM).
      const melodic = midi.tracks
        .map((t, i) => ({ track: t, trackIndex: i + 1 }))
        .filter(({ track }) => track.notes.length > 0 && track.channel !== 9);
      if (melodic.length === 0) {
        throw new Error("Il file non contiene tracce melodiche riproducibili");
      }

      // GainNode per ogni traccia con note (mute per numero traccia, non per canale MIDI).
      const tracksWithNotes = midi.tracks
        .map((t, i) => ({ track: t, trackIndex: i + 1 }))
        .filter(({ track }) => track.notes.length > 0);
      const gainOfTrack = new Map<number, GainNode>();
      for (const { trackIndex } of tracksWithNotes) {
        const g = ac.createGain();
        g.gain.value = trackIndex === mutedRef.current ? 0 : 1;
        g.connect(ac.destination);
        gainOfTrack.set(trackIndex, g);
      }
      gleitzLiveRef.current = { ctx: ac, gainOfTrack };
      gleitzPlayersRef.current = new Map();

      // strumenti caricati per traccia (lo stesso file mp3 è in cache HTTP: il costo extra è solo la decodifica)
      setSfProgress({ done: 0, total: melodic.length });
      let loaded = 0;
      await Promise.all(
        melodic.map(async ({ track, trackIndex }) => {
          const gleitzName = gleitzNameForPatch(track.instrument.number);
          const p = await Soundfont.instrument(ac, gleitzName as Parameters<typeof Soundfont.instrument>[1], {
            nameToUrl,
            format: "mp3",
            destination: gainOfTrack.get(trackIndex),
          });
          players.set(String(trackIndex), p);
          gleitzPlayersRef.current.set(trackIndex, p);
          loaded += 1;
          setSfProgress({ done: loaded, total: melodic.length });
        })
      );

      setLoadingSf(false);
      setSfProgress(null);

      type Ev = {
        time: number;
        trackIndex: number;
        midi: number;
        duration: number;
        gain: number;
        inst: ReturnType<typeof players.get>;
      };
      const events: Ev[] = [];
      for (const { track, trackIndex } of melodic) {
        const inst = players.get(String(trackIndex))!;
        for (const note of track.notes) {
          events.push({
            time: note.time,
            trackIndex,
            midi: note.midi,
            duration: Math.max(0.02, note.duration),
            gain: Math.max(0.05, note.velocity ?? 0.75),
            inst,
          });
        }
      }
      events.sort((a, b) => a.time - b.time);

      const LOOKAHEAD = 8; // secondi di note programmate in anticipo
      let songZero = ac.currentTime + 0.35; // tempo-brano 0 in tempo-contesto
      let cursor = 0;
      timeSourceRef.current = () => Math.max(0, ac.currentTime - songZero);

      const stopAllNotes = () => {
        for (const p of players.values()) {
          try {
            p.stop?.();
          } catch {
            /* ignore */
          }
        }
      };

      const pump = () => {
        if (ac.state !== "running") return;
        const horizon = ac.currentTime - songZero + LOOKAHEAD;
        while (cursor < events.length && events[cursor].time <= horizon) {
          const ev = events[cursor++];
          // mute live: le note della traccia silenziata si saltano in fase di programmazione
          if (ev.trackIndex === mutedRef.current) continue;
          const name = midiNumberToName(ev.midi + transposeRef.current);
          if (!name) continue;
          const when = Math.max(songZero + ev.time, ac.currentTime + 0.02);
          try {
            ev.inst!.play(name, when, { duration: ev.duration, gain: ev.gain });
          } catch {
            /* nota fuori dal range del campione: il resto del brano continua */
          }
        }
      };

      const rescheduleFromNow = () => {
        if (ac.state !== "running") return;
        stopAllNotes();
        const now = Math.max(0, ac.currentTime - songZero);
        cursor = 0;
        while (cursor < events.length && events[cursor].time < now) cursor++;
        pump();
      };

      gleitzPumpRef.current = { rescheduleFromNow };
      pump();
      const pumpTimer = window.setInterval(pump, 1500);

      // fine brano: watcher sul tempo (un timeout fisso sbaglierebbe dopo una pausa)
      const endAt = Math.max(0.5, midi.duration);
      const endWatch = window.setInterval(() => {
        if (ac.state === "running" && ac.currentTime - songZero >= endAt + 0.3) {
          window.clearInterval(endWatch);
          setPlaying(false);
          setTransportSec(0);
          onEnded?.();
        }
      }, 400);

      // pausa = sospensione del contesto: congela clock e note programmate, la ripresa è perfetta
      controlsRef.current = {
        pause: () => void ac.suspend().catch(() => {}),
        resume: () => void ac.resume().catch(() => {}),
        restart: () => {
          stopAllNotes();
          cursor = 0;
          songZero = ac.currentTime + 0.35;
          void ac.resume().catch(() => {});
          pump();
        },
        seek: (sec: number) => {
          stopAllNotes();
          cursor = 0;
          while (cursor < events.length && events[cursor].time < sec) cursor++;
          songZero = ac.currentTime - sec;
          if (ac.state === "running") pump();
        },
      };
      setPaused(false);
      setPlaying(true);
      bumpControlsVisibility();

      disposeRef.current = () => {
        window.clearInterval(pumpTimer);
        window.clearInterval(endWatch);
        controlsRef.current = null;
        gleitzLiveRef.current = null;
        gleitzPumpRef.current = null;
        gleitzPlayersRef.current.clear();
        stopAllNotes();
        players.clear();
        cleanupAc();
      };
    } catch (e) {
      console.error("[karaoke] avvio gleitz fallito", e);
      setLoadingSf(false);
      setSfProgress(null);
      setLoadError(e instanceof Error ? e.message : "Errore durante l'avvio del brano");
      cleanupAc();
    }
  }, [midi, bank.gleitzFolder, onEnded, bumpControlsVisibility]);

  const startPlayback = useCallback(async () => {
    try {
      if (bank.kind === "sf2") {
        await startSf2Playback();
      } else {
        await startGleitzPlayback();
      }
    } catch (e) {
      // Rete di sicurezza: qualsiasi errore deve arrivare a schermo, mai un click "a vuoto".
      console.error("[karaoke] avvio fallito", e);
      setLoadingSf(false);
      setSfProgress(null);
      setLoadError(e instanceof Error ? e.message : "Avvio non riuscito");
    }
  }, [bank.kind, startSf2Playback, startGleitzPlayback]);

  function togglePause() {
    const c = controlsRef.current;
    if (!c) return;
    if (paused) {
      c.resume();
      setPaused(false);
    } else {
      c.pause();
      setPaused(true);
    }
    bumpControlsVisibility();
  }

  function handleFrameClick(e: React.MouseEvent) {
    if (!playing) return;
    if ((e.target as HTMLElement).closest("[data-stage-controls]")) return;
    togglePause();
  }

  function restart() {
    controlsRef.current?.restart();
    setPaused(false);
    setTransportSec(0);
    bumpControlsVisibility();
  }

  function seekTo(sec: number) {
    controlsRef.current?.seek(sec);
    setTransportSec(sec);
    bumpControlsVisibility();
  }

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current != null) window.clearTimeout(hideControlsTimerRef.current);
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      setTransportSec(0);
      return;
    }
    const source = timeSourceRef.current;
    if (!source) return;
    const tick = () => {
      setTransportSec(source());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // Il file .lrc (se caricato dall'admin) ha priorità sui testi incorporati nel MIDI.
  const effectiveLines = lrcLines.length > 0 ? lrcLines : midiLyrics;
  const idx = useMemo(() => currentLrcIndex(effectiveLines, transportSec), [effectiveLines, transportSec]);
  const idxShow = idx < 0 ? 0 : idx;

  /**
   * Schermata karaoke classica a 4 righe: due coppie. Si canta la coppia in alto,
   * poi si passa a quella in basso; intanto in alto si caricano le due righe successive.
   */
  const pair = Math.floor(idxShow / 2);
  const topPair = pair % 2 === 0 ? pair : pair + 1;
  const bottomPair = pair % 2 === 0 ? pair + 1 : pair;
  const rowLineIdx = [topPair * 2, topPair * 2 + 1, bottomPair * 2, bottomPair * 2 + 1];

  function lyricRowClass(lineIdx: number): string {
    if (lineIdx === idxShow) {
      // riga corrente: il viola dell'app
      return "text-fuchsia-400 drop-shadow-[0_0_25px_rgba(192,38,211,0.45)]";
    }
    if (lineIdx < idxShow) return "text-zinc-600";
    return "text-zinc-100";
  }

  const durationSec = Math.max(0.5, midi?.duration ?? 0);

  // Stessa cornice "palco" dei video YouTube: card nera che riempe lo schermo, overlay di avvio.
  return (
    <div
      className={STAGE_SHELL_CLASS}
      onMouseMove={playing ? bumpControlsVisibility : undefined}
      onTouchStart={playing ? bumpControlsVisibility : undefined}
      onClick={playing ? handleFrameClick : undefined}
    >
      {playing ? (
        <>
          <div className="flex h-full cursor-pointer flex-col items-center justify-center gap-5 px-8 py-12 pb-24 text-center md:gap-8">
            {effectiveLines.length > 0 ? (
              rowLineIdx.map((lineIdx, row) => (
                <p
                  key={row < 2 ? `t${topPair}-${row}` : `b${bottomPair}-${row}`}
                  className={`min-h-[1.4em] text-3xl font-semibold leading-tight md:text-5xl ${lyricRowClass(lineIdx)}`}
                >
                  {effectiveLines[lineIdx]?.text ?? " "}
                </p>
              ))
            ) : (
              <>
                <h1 className="font-display text-4xl font-bold text-white md:text-6xl">{title}</h1>
                <p className="text-xl text-zinc-400">{artist}</p>
                <p className="text-sm text-zinc-600">
                  Nessun testo nel file (né .lrc caricato): base strumentale.
                </p>
              </>
            )}
          </div>

          <StageTransportBar
            visible={controlsVisible || paused}
            paused={paused}
            currentSec={transportSec}
            durationSec={durationSec}
            onSeek={seekTo}
            onTogglePause={togglePause}
            onRestart={restart}
          />
        </>
      ) : (
        <StageStartOverlay
          title={title}
          subtitle={artist}
          badges={
            <span className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-widest text-amber-200/90">
                🎹 Karaoke MIDI
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-widest text-zinc-400">
                {bank.shortLabel}
              </span>
            </span>
          }
          error={loadError}
          showButton={Boolean(midi && !loadError)}
          waitingText={!midi && !loadError ? "Carico il brano…" : null}
          buttonLabel={
            loadingSf
              ? sfProgress
                ? `Carico strumenti… ${sfProgress.done}/${sfProgress.total}`
                : "Carico strumenti…"
              : "▶ Avvia karaoke"
          }
          buttonDisabled={loadingSf}
          onStart={() => void startPlayback()}
        />
      )}
    </div>
  );
}
