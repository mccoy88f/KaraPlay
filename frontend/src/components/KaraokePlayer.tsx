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
  /** Traccia MIDI da silenziare (1-based): la voce guida, di solito la 4. */
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
  const [transportSec, setTransportSec] = useState(0);
  const [loadingSf, setLoadingSf] = useState(false);
  const [sfProgress, setSfProgress] = useState<{ done: number; total: number } | null>(null);

  const disposeRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const midiBufRef = useRef<ArrayBuffer | null>(null);
  /** Sorgente del tempo di trasporto (per i testi): impostata dal motore di playback attivo. */
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
        /* senza .lrc valgono i testi incorporati nel MIDI */
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
      let playBuf = midiBuf.slice(0);
      if (mutedTrack != null) {
        // voce guida: si toglie la traccia rigenerando il file, il sequencer suona il resto
        try {
          const m = new Midi(midiBuf);
          const t = m.tracks[mutedTrack - 1];
          if (t) {
            t.notes = [];
            playBuf = m.toArray().buffer as ArrayBuffer;
          }
        } catch {
          /* file anomalo: si suona tutto */
        }
      }
      seq.loadNewSongList([{ binary: playBuf, fileName: `${title}.mid` }]);
      seq.eventHandler.addEvent("songEnded", "karaoke-player-end", () => {
        setPlaying(false);
        setTransportSec(0);
        onEnded?.();
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
  }, [midi, bank.sf2File, title, onEnded, mutedTrack]);

  /**
   * Motore Gleitz (campioni mp3 pre-renderizzati): AudioContext puro, lo stesso schema
   * dell'anteprima nel catalogo. Il contesto di Tone.js usato in precedenza non suonava
   * (wrapper standardized-audio-context): Tone è stato rimosso del tutto.
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

      const audibleTracks = midi.tracks.filter((_t, i) => i + 1 !== (mutedTrack ?? -1));
      const melodicTracks = audibleTracks.filter((t) => t.notes.length > 0 && t.channel !== 9);
      if (melodicTracks.length === 0) {
        throw new Error("Il file non contiene tracce melodiche riproducibili");
      }

      const neededInstruments = [...new Set(melodicTracks.map((t) => gleitzNameForPatch(t.instrument.number)))];
      setSfProgress({ done: 0, total: neededInstruments.length });
      let loaded = 0;
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

      setLoadingSf(false);
      setSfProgress(null);

      // Tutte le note ordinate per tempo: la programmazione è a finestra scorrevole.
      // Schedularle tutte subito creava ~2 nodi audio per nota (decine di migliaia):
      // il thread audio collassava — clock quasi fermo sul display, gracchiare in anteprima.
      type Ev = { time: number; name: string; duration: number; gain: number; inst: ReturnType<typeof players.get> };
      const events: Ev[] = [];
      for (const track of melodicTracks) {
        const inst = players.get(gleitzNameForPatch(track.instrument.number))!;
        for (const note of track.notes) {
          events.push({
            time: note.time,
            name: note.name,
            duration: Math.max(0.02, note.duration),
            gain: Math.max(0.05, note.velocity ?? 0.75),
            inst,
          });
        }
      }
      events.sort((a, b) => a.time - b.time);

      const LOOKAHEAD = 8; // secondi di note programmate in anticipo
      const PUMP_MS = 1500;
      const songZero = ac.currentTime + 0.35; // tempo-brano 0 in tempo-contesto
      timeSourceRef.current = () => Math.max(0, ac.currentTime - songZero);

      let cursor = 0;
      const pump = () => {
        const horizon = ac.currentTime - songZero + LOOKAHEAD;
        while (cursor < events.length && events[cursor].time <= horizon) {
          const ev = events[cursor++];
          const when = Math.max(songZero + ev.time, ac.currentTime + 0.02);
          try {
            ev.inst!.play(ev.name, when, { duration: ev.duration, gain: ev.gain });
          } catch {
            /* nota fuori dal range del campione: il resto del brano continua */
          }
        }
      };
      pump();
      const pumpTimer = window.setInterval(pump, PUMP_MS);

      const endAt = Math.max(0.5, midi.duration);
      const endTimer = window.setTimeout(() => {
        setPlaying(false);
        setTransportSec(0);
        onEnded?.();
      }, endAt * 1000 + 300);

      setPlaying(true);

      disposeRef.current = () => {
        window.clearTimeout(endTimer);
        window.clearInterval(pumpTimer);
        for (const p of players.values()) {
          try {
            p.stop?.();
          } catch {
            /* ignore */
          }
        }
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
  }, [midi, bank.gleitzFolder, onEnded, mutedTrack]);

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
  const idxShow = idx < 0 ? 0 : idx;

  // Stessa cornice "palco" dei video YouTube: card nera che riempe lo schermo, overlay di avvio.
  return (
    <div className="relative min-h-[24rem] w-full flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/60">
      {playing ? (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-8 py-10 text-center md:gap-10">
          {effectiveLines.length > 0 ? (
            <>
              <p className="min-h-[1.5em] text-2xl text-zinc-600 md:text-3xl">
                {effectiveLines[idxShow - 1]?.text ?? " "}
              </p>
              <p className="text-4xl font-semibold leading-tight text-fuchsia-100 drop-shadow-[0_0_30px_rgba(232,121,249,0.3)] md:text-6xl">
                {effectiveLines[idxShow]?.text ?? "…"}
              </p>
              <p className="min-h-[1.5em] text-2xl text-zinc-500 md:text-3xl">
                {effectiveLines[idxShow + 1]?.text ?? " "}
              </p>
            </>
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
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
          <p className="font-display max-w-3xl text-2xl font-semibold text-white md:text-4xl">{title}</p>
          <p className="text-zinc-400">{artist}</p>
          <span className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-widest text-amber-200/90">
              🎹 Karaoke MIDI
            </span>
            <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-widest text-zinc-400">
              {bank.shortLabel}
            </span>
          </span>

          {loadError && <p className="max-w-xl text-sm text-red-400">{loadError}</p>}

          {midi && !loadError && (
            <button
              type="button"
              disabled={loadingSf}
              onClick={() => void startPlayback()}
              className="rounded-xl bg-fuchsia-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-fuchsia-900/40 hover:bg-fuchsia-500 disabled:opacity-50"
            >
              {loadingSf
                ? sfProgress
                  ? `Carico strumenti… ${sfProgress.done}/${sfProgress.total}`
                  : "Carico strumenti…"
                : "▶ Avvia karaoke"}
            </button>
          )}
          {!midi && !loadError && <p className="text-sm text-zinc-500">Carico il brano…</p>}
          <p className="text-xs text-zinc-400">
            Il browser richiede un tap su questo pulsante per avviare l&apos;audio.
          </p>
        </div>
      )}
    </div>
  );
}
