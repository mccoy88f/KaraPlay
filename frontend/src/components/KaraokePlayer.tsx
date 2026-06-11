import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import * as Tone from "tone";
import Soundfont from "soundfont-player";
import { currentLrcIndex, parseLrc, type LrcLine } from "../lib/lrc";
import { gleitzNameForPatch } from "../lib/gmPatchToGleitz";
import { getSoundfontBank } from "../lib/soundfontBanks";
import type { SoundfontBankId } from "../lib/soundfontBanks";

const base = import.meta.env.VITE_API_URL ?? "";

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
  const [playing, setPlaying] = useState(false);
  const [transportSec, setTransportSec] = useState(0);
  const [loadingSf, setLoadingSf] = useState(false);

  const disposeRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const acRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error("MIDI non trovato");
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        setMidi(new Midi(buf));
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

  const startPlayback = useCallback(async () => {
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

    setLoadingSf(true);
    const players = new Map<string, Awaited<ReturnType<typeof Soundfont.instrument>>>();
    const loadInst = async (gleitzName: string) => {
      if (players.has(gleitzName)) return players.get(gleitzName)!;
      const p = await Soundfont.instrument(ac, gleitzName as Parameters<typeof Soundfont.instrument>[1], {
        nameToUrl,
        format: "mp3",
      });
      players.set(gleitzName, p);
      return p;
    };

    const melodicTracks = midi.tracks.filter((t) => t.notes.length > 0 && t.channel !== 9);
    const drumTracks = midi.tracks.filter((t) => t.notes.length > 0 && t.channel === 9);

    const neededInstruments = [...new Set(melodicTracks.map((t) => gleitzNameForPatch(t.instrument.number)))];

    try {
      for (const gleitzName of neededInstruments) {
        await loadInst(gleitzName);
      }
    } catch (e) {
      setLoadingSf(false);
      setLoadError(e instanceof Error ? e.message : "Errore caricamento soundfont");
      return;
    }

    setLoadingSf(false);

    const leadSec = 0.25;
    const t0 = ac.currentTime + leadSec;

    const drumSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    drumSynth.volume.value = -12;

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
        inst.play(note.name, when, { duration: dur, gain });
      }
    }

    for (const track of drumTracks) {
      for (const note of track.notes) {
        scheduled += 1;
        if (scheduled % yieldEvery === 0) await yieldToMain();
        const when = scheduleAt(note.time);
        markZero(when, note.time);
        const vel = note.velocity ?? 0.75;
        drumSynth.triggerAttackRelease(note.name, note.duration, when, vel);
      }
    }

    t0Ref.current = Number.isFinite(songZeroAbs) ? songZeroAbs : t0;

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
  }, [midi, bank.gleitzFolder, base]);

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
    const ac = acRef.current;
    if (!ac) return;
    const tick = () => {
      setTransportSec(Math.max(0, ac.currentTime - t0Ref.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const idx = useMemo(() => currentLrcIndex(lrcLines, transportSec), [lrcLines, transportSec]);
  const idxShow = idx < 0 ? 0 : idx;

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
            {loadingSf ? "Carico strumenti…" : "Avvia karaoke"}
          </button>
          <p className="text-center text-xs text-zinc-500">
            Il browser richiede un tap su questo pulsante per l&apos;audio. Dopo un ricaricamento della pagina
            premi di nuovo &quot;Avvia karaoke&quot; (lo stato in sala si ripristina, l&apos;audio no).
          </p>
        </div>
      )}

      <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-6 py-10 text-left shadow-inner shadow-black/40">
        {lrcLines.length > 0 ? (
          <div className="space-y-6">
            {lrcLines[idxShow - 1] && (
              <p className="text-xl text-zinc-600 line-through decoration-zinc-700 md:text-2xl">
                {lrcLines[idxShow - 1].text}
              </p>
            )}
            <p className="text-3xl font-semibold leading-tight text-fuchsia-100 drop-shadow-[0_0_20px_rgba(232,121,249,0.25)] md:text-5xl">
              {lrcLines[idxShow]?.text ?? "…"}
            </p>
            {lrcLines[idxShow + 1] && (
              <p className="text-xl text-zinc-500 md:text-2xl">{lrcLines[idxShow + 1].text}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-lg text-zinc-400">
              <span className="font-semibold text-zinc-200">{title}</span>
            </p>
            <p className="text-sm text-zinc-500">
              Il file MIDI non contiene testo cantabile: servono parole in un file{" "}
              <strong className="text-zinc-400">.lrc</strong> caricato dall&apos;admin insieme al MIDI. Senza LRC
              sentirai solo la base strumentale dopo &quot;Avvia karaoke&quot;.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
