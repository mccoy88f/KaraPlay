import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import * as Tone from "tone";
import Soundfont from "soundfont-player";
import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";
import spessaWorkletUrl from "spessasynth_lib/dist/spessasynth_processor.min.js?url";
import { currentLrcIndex, parseLrc, type LrcLine } from "../lib/lrc";
import { extractMidiLyrics } from "../lib/midiLyrics";
import { LyricsPanel } from "./LyricsPanel";
import { gleitzNameForPatch } from "../lib/gmPatchToGleitz";
import { getSoundfontBank } from "../lib/soundfontBanks";
import type { SoundfontBankId } from "../lib/soundfontBanks";

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

/** Chiamare sincronamente dall’handler onClick/onPointerDown prima di qualsiasi await (policy Chrome). */
function primeAudioFromUserGesture(): void {
  try {
    const ctx = Tone.getContext();
    void ctx.resume();
    const ac = ctx.rawContext as AudioContext;
    if (ac.state === "suspended") {
      void ac.resume();
    }
  } catch {
    /* contesto non ancora creato */
  }
}

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
};

export function KaraokePlayer({ songId, title, artist, lrcPath, soundfontBankId, remoteMidiUrl }: Props) {
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
  const [transportSec, setTransportSec] = useState(0);
  const [loadingSf, setLoadingSf] = useState(false);
  const [sfProgress, setSfProgress] = useState<{ done: number; total: number } | null>(null);

  const disposeRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const acRef = useRef<AudioContext | null>(null);
  const midiBufRef = useRef<ArrayBuffer | null>(null);
  /** Sorgente del tempo di trasporto (per LRC): impostata dal motore di playback attivo. */
  const timeSourceRef = useRef<(() => number) | null>(null);

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
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lrcUrl]);

  /** Motore SF2: sintesi completa via spessasynth (batteria GM, program change, pitch bend). */
  const startSf2Playback = useCallback(async () => {
    const midiBuf = midiBufRef.current;
    const sf2File = bank.sf2File;
    if (!midi || !midiBuf || !sf2File) return;
    disposeRef.current?.();
    disposeRef.current = null;

    const ac = new AudioContext();
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

      // skipToFirstNoteOn falso: il tempo deve restare allineato ai timestamp LRC.
      const seq = new Sequencer(synth, { skipToFirstNoteOn: false });
      seq.loopCount = 0;
      seq.loadNewSongList([{ binary: midiBuf.slice(0), fileName: `${title}.mid` }]);
      seq.eventHandler.addEvent("songEnded", "karaoke-player-end", () => {
        setPlaying(false);
        setTransportSec(0);
      });
      seq.play();

      timeSourceRef.current = () => Math.max(0, seq.currentHighResolutionTime);
      setLoadingSf(false);
      setPlaying(true);

      disposeRef.current = () => {
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
  }, [midi, bank.sf2File, title]);

  const startGleitzPlayback = useCallback(async () => {
    if (!midi) return;
    disposeRef.current?.();
    disposeRef.current = null;

    primeAudioFromUserGesture();
    await Tone.start();
    const toneCtx = Tone.getContext();
    await toneCtx.resume();
    const ac = toneCtx.rawContext as AudioContext;
    if (ac.state === "suspended") {
      await ac.resume();
    }
    acRef.current = ac;

    const folder = bank.gleitzFolder;
    const nameToUrl = (name: string, _sf: string, format: string) => {
      const fmt = format === "ogg" ? "ogg" : "mp3";
      const root = base || "";
      return `${root}/api/media/soundfont/${encodeURIComponent(folder)}/${encodeURIComponent(`${name}-${fmt}.js`)}`;
    };

    const players = new Map<string, Awaited<ReturnType<typeof Soundfont.instrument>>>();

    const melodicTracks = midi.tracks.filter((t) => t.notes.length > 0 && t.channel !== 9);
    const drumTracks = midi.tracks.filter((t) => t.notes.length > 0 && t.channel === 9);

    const neededInstruments = [...new Set(melodicTracks.map((t) => gleitzNameForPatch(t.instrument.number)))];

    setLoadingSf(true);
    setSfProgress({ done: 0, total: neededInstruments.length });
    let loaded = 0;
    try {
      // I file con molte tracce (GM completi) richiedono 10+ strumenti: in parallelo, con progresso.
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
    } catch (e) {
      console.error("[karaoke] caricamento soundfont fallito", e);
      setLoadingSf(false);
      setSfProgress(null);
      setLoadError(e instanceof Error ? e.message : "Errore caricamento soundfont");
      return;
    }

    setLoadingSf(false);
    setSfProgress(null);

    const drumSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    drumSynth.volume.value = -12;

    try {
      const leadSec = 0.25;
      const t0 = ac.currentTime + leadSec;

      const scheduleAt = (offsetFromT0: number) => Math.max(t0 + offsetFromT0, ac.currentTime + 0.02);

      /** Brani con migliaia di note: un solo loop sincrono blocca il main thread e l’audio non parte (file corto ok). */
      const yieldEvery = 350;
      let scheduled = 0;
      const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

      let songZeroAbs = Infinity;
      const markZero = (when: number, noteTime: number) => {
        songZeroAbs = Math.min(songZeroAbs, when - noteTime);
      };

      for (const track of melodicTracks) {
        const gleitzName = gleitzNameForPatch(track.instrument.number);
        const inst = players.get(gleitzName)!;
        for (const note of track.notes) {
          scheduled += 1;
          if (scheduled % yieldEvery === 0) await yieldToMain();
          const when = scheduleAt(note.time);
          markZero(when, note.time);
          const gain = Math.max(0.05, note.velocity ?? 0.75);
          const dur = Math.max(0.02, note.duration);
          try {
            inst.play(note.name, when, { duration: dur, gain });
          } catch {
            /* nota fuori dal range del campione: il resto del brano continua */
          }
        }
      }

      for (const track of drumTracks) {
        for (const note of track.notes) {
          scheduled += 1;
          if (scheduled % yieldEvery === 0) await yieldToMain();
          const when = scheduleAt(note.time);
          markZero(when, note.time);
          const vel = note.velocity ?? 0.75;
          try {
            drumSynth.triggerAttackRelease(note.name, note.duration, when, vel);
          } catch {
            /* polifonia/timing fuori range: nota saltata */
          }
        }
      }

      t0Ref.current = Number.isFinite(songZeroAbs) ? songZeroAbs : t0;
      timeSourceRef.current = () => Math.max(0, ac.currentTime - t0Ref.current);

      const endAt = Math.max(0.5, midi.duration);
      const endTimer = window.setTimeout(() => {
        setPlaying(false);
        setTransportSec(0);
      }, endAt * 1000 + 300);

      setPlaying(true);

      disposeRef.current = () => {
        window.clearTimeout(endTimer);
        for (const p of players.values()) {
          try {
            p.stop?.();
          } catch {
            /* ignore */
          }
        }
        players.clear();
        drumSynth.dispose();
      };
    } catch (e) {
      // Prima l'eccezione interrompeva tutto in silenzio: il pulsante restava lì e "non accadeva niente".
      console.error("[karaoke] scheduling fallito", e);
      drumSynth.dispose();
      setLoadError(e instanceof Error ? e.message : "Errore durante l'avvio del brano");
    }
  }, [midi, bank.gleitzFolder, base]);

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

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8">
      <div>
        <p className="text-lg text-zinc-300">
          <span className="font-semibold text-white">{artist}</span>
        </p>
        <h1 className="mt-1 text-4xl font-bold text-white md:text-6xl">{title}</h1>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-200/90">
            Karaoke MIDI
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-zinc-400">
            Banco {bank.shortLabel}
          </span>
        </p>
      </div>

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}

      {midi && !playing && !loadError && (
        <div className="flex max-w-lg flex-col items-center gap-3">
          <button
            type="button"
            disabled={loadingSf}
            onPointerDown={() => {
              primeAudioFromUserGesture();
            }}
            onClick={() => void startPlayback()}
            className="rounded-xl bg-fuchsia-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-fuchsia-900/40 hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {loadingSf
              ? sfProgress
                ? `Carico strumenti… ${sfProgress.done}/${sfProgress.total}`
                : "Carico strumenti…"
              : "Avvia karaoke"}
          </button>
          <p className="text-center text-xs text-zinc-500">
            Il browser richiede un tap su questo pulsante per l&apos;audio. Dopo un ricaricamento della pagina
            premi di nuovo &quot;Avvia karaoke&quot; (lo stato in sala si ripristina, l&apos;audio no).
          </p>
        </div>
      )}

      <LyricsPanel
        lines={effectiveLines}
        index={idx}
        title={title}
        noLyricsHint='Nessun testo trovato: né incorporato nel file MIDI né in un .lrc caricato dall&apos;admin. Sentirai solo la base strumentale dopo "Avvia karaoke".'
      />
    </div>
  );
}
