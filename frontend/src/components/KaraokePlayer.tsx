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
import { STAGE_SHELL_CLASS, StageStartOverlay } from "./StageStartOverlay";

const base = import.meta.env.VITE_API_URL ?? "";

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

type Controls = {
  pause: () => void;
  resume: () => void;
  restart: () => void;
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
};

export function KaraokePlayer({ songId, title, artist, lrcPath, soundfontBankId, remoteMidiUrl, onEnded, mutedTrack }: Props) {
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

  const disposeRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const midiBufRef = useRef<ArrayBuffer | null>(null);
  /** Sorgente del tempo di trasporto (per i testi): impostata dal motore di playback attivo. */
  const timeSourceRef = useRef<(() => number) | null>(null);
  /** Comandi play/pausa/riavvia del motore attivo. */
  const controlsRef = useRef<Controls | null>(null);
  /** Traccia silenziata corrente: modificabile dalla console anche a brano in corso. */
  const mutedRef = useRef<number | null>(mutedTrack ?? null);
  /** Per il mute live in SF2: synth e canale di ogni traccia. */
  const sf2LiveRef = useRef<{ synth: WorkletSynthesizer; channelOfTrack: number[] } | null>(null);

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

  // Mute live: la console può cambiare la traccia silenziata anche a brano in corso.
  useEffect(() => {
    const prev = mutedRef.current;
    const next = mutedTrack ?? null;
    mutedRef.current = next;
    const live = sf2LiveRef.current;
    if (!live || prev === next) return;
    const setMute = (track: number | null, muted: boolean) => {
      if (track == null) return;
      const ch = live.channelOfTrack[track - 1];
      if (ch == null) return;
      try {
        live.synth.midiChannels[ch]?.setSystemParameter("isMuted", muted);
      } catch {
        /* canale non disponibile */
      }
    };
    setMute(prev, false);
    setMute(next, true);
  }, [mutedTrack]);

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
      seq.loadNewSongList([{ binary: midiBuf.slice(0), fileName: `${title}.mid` }]);
      seq.eventHandler.addEvent("songEnded", "karaoke-player-end", () => {
        setPlaying(false);
        setTransportSec(0);
        onEnded?.();
      });
      seq.play();

      // mute per canale (non si tolgono le note dal file: così si può riattivare live)
      sf2LiveRef.current = { synth, channelOfTrack: midi.tracks.map((t) => t.channel) };
      if (mutedRef.current != null) {
        const ch = midi.tracks[mutedRef.current - 1]?.channel;
        if (ch != null) {
          try {
            synth.midiChannels[ch]?.setSystemParameter("isMuted", true);
          } catch {
            /* canale non disponibile */
          }
        }
      }

      timeSourceRef.current = () => Math.max(0, seq.currentHighResolutionTime);
      controlsRef.current = {
        pause: () => seq.pause(),
        resume: () => seq.play(),
        restart: () => {
          seq.currentTime = 0;
          seq.play();
        },
      };
      setLoadingSf(false);
      setPaused(false);
      setPlaying(true);

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
  }, [midi, bank.sf2File, title, onEnded]);

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

      // tutte le tracce melodiche (anche quella al momento silenziata: si può riattivare live)
      const melodic = midi.tracks
        .map((t, i) => ({ track: t, trackIndex: i + 1 }))
        .filter(({ track }) => track.notes.length > 0 && track.channel !== 9);
      if (melodic.length === 0) {
        throw new Error("Il file non contiene tracce melodiche riproducibili");
      }

      const neededInstruments = [...new Set(melodic.map(({ track }) => gleitzNameForPatch(track.instrument.number)))];
      setSfProgress({ done: 0, total: neededInstruments.length });
      let loaded = 0;
      await Promise.all(
        neededInstruments.map(async (gleitzName) => {
          const p = await Soundfont.instrument(ac, gleitzName as Parameters<typeof Soundfont.instrument>[1], {
            nameToUrl,
            format: "mp3",
          });
          players.set(gleitzName, p);
          loaded += 1;
          setSfProgress({ done: loaded, total: neededInstruments.length });
        })
      );

      setLoadingSf(false);
      setSfProgress(null);

      type Ev = { time: number; trackIndex: number; name: string; duration: number; gain: number; inst: ReturnType<typeof players.get> };
      const events: Ev[] = [];
      for (const { track, trackIndex } of melodic) {
        const inst = players.get(gleitzNameForPatch(track.instrument.number))!;
        for (const note of track.notes) {
          events.push({
            time: note.time,
            trackIndex,
            name: note.name,
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

      const pump = () => {
        if (ac.state !== "running") return;
        const horizon = ac.currentTime - songZero + LOOKAHEAD;
        while (cursor < events.length && events[cursor].time <= horizon) {
          const ev = events[cursor++];
          // mute live: le note della traccia silenziata si saltano in fase di programmazione
          if (ev.trackIndex === mutedRef.current) continue;
          const when = Math.max(songZero + ev.time, ac.currentTime + 0.02);
          try {
            ev.inst!.play(ev.name, when, { duration: ev.duration, gain: ev.gain });
          } catch {
            /* nota fuori dal range del campione: il resto del brano continua */
          }
        }
      };
      pump();
      const pumpTimer = window.setInterval(pump, 1500);

      const stopAllNotes = () => {
        for (const p of players.values()) {
          try {
            p.stop?.();
          } catch {
            /* ignore */
          }
        }
      };

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
      };
      setPaused(false);
      setPlaying(true);

      disposeRef.current = () => {
        window.clearInterval(pumpTimer);
        window.clearInterval(endWatch);
        controlsRef.current = null;
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
  }, [midi, bank.gleitzFolder, onEnded]);

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
  }

  function restart() {
    controlsRef.current?.restart();
    setPaused(false);
    setTransportSec(0);
  }

  useEffect(() => {
    return () => {
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

  // Stessa cornice "palco" dei video YouTube: card nera che riempe lo schermo, overlay di avvio.
  return (
    <div className={STAGE_SHELL_CLASS}>
      {playing ? (
        <>
          <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-12 text-center md:gap-8">
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

          {/* comandi del presentatore, in alto a destra */}
          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              type="button"
              onClick={togglePause}
              title={paused ? "Riprendi" : "Pausa"}
              className="rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200 backdrop-blur hover:bg-zinc-800"
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              type="button"
              onClick={restart}
              title="Riavvia dall'inizio"
              className="rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-200 backdrop-blur hover:bg-zinc-800"
            >
              ↻
            </button>
          </div>
          {paused && (
            <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1 text-xs uppercase tracking-widest text-amber-200">
              in pausa
            </p>
          )}
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
