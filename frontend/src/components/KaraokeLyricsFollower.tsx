import { useEffect, useMemo, useState } from "react";
import { Midi } from "@tonejs/midi";
import { currentLrcIndex, parseLrc, type LrcLine } from "../lib/lrc";
import { extractMidiLyrics } from "../lib/midiLyrics";
import { STAGE_SHELL_CLASS } from "./StageStartOverlay";

const base = import.meta.env.VITE_API_URL ?? "";

type Props = {
  songId: string;
  title: string;
  artist: string;
  lrcPath?: string | null;
  transportSec: number;
  synced: boolean;
};

/** Testi karaoke sincronizzati allo schermo sala: nessun audio, nessun banco sonoro. */
export function KaraokeLyricsFollower({ songId, title, artist, lrcPath, transportSec, synced }: Props) {
  const midiUrl = `${base}/api/media/song/${encodeURIComponent(songId)}/midi`;
  const lrcUrl = lrcPath ? `${base}/api/media/song/${encodeURIComponent(songId)}/lrc` : null;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [midiLyrics, setMidiLyrics] = useState<LrcLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error("Testi non disponibili");
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const parsed = new Midi(buf);
        try {
          setMidiLyrics(extractMidiLyrics(buf, parsed));
        } catch {
          setMidiLyrics([]);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Errore caricamento");
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
        /* fallback su testi nel MIDI */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lrcUrl]);

  const effectiveLines = lrcLines.length > 0 ? lrcLines : midiLyrics;
  const idx = useMemo(() => currentLrcIndex(effectiveLines, transportSec), [effectiveLines, transportSec]);
  const idxShow = idx < 0 ? 0 : idx;

  const pair = Math.floor(idxShow / 2);
  const topPair = pair % 2 === 0 ? pair : pair + 1;
  const bottomPair = pair % 2 === 0 ? pair + 1 : pair;
  const rowLineIdx = [topPair * 2, topPair * 2 + 1, bottomPair * 2, bottomPair * 2 + 1];

  function lyricRowClass(lineIdx: number): string {
    if (lineIdx === idxShow) {
      return "text-fuchsia-400 drop-shadow-[0_0_25px_rgba(192,38,211,0.45)]";
    }
    if (lineIdx < idxShow) return "text-zinc-600";
    return "text-zinc-100";
  }

  return (
    <div className={STAGE_SHELL_CLASS}>
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-10 text-center md:gap-8">
        {!synced && (
          <p className="absolute left-4 right-4 top-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            In attesa dello schermo principale… Apri il proiettore con{" "}
            <span className="font-mono text-amber-200">?eventId=</span> e avvia il brano.
          </p>
        )}
        {loadError && <p className="text-sm text-red-400">{loadError}</p>}
        {effectiveLines.length > 0 ? (
          rowLineIdx.map((lineIdx, row) => (
            <p
              key={row < 2 ? `t${topPair}-${row}` : `b${bottomPair}-${row}`}
              className={`min-h-[1.4em] text-2xl font-semibold leading-tight md:text-4xl ${lyricRowClass(lineIdx)}`}
            >
              {effectiveLines[lineIdx]?.text ?? " "}
            </p>
          ))
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold text-white md:text-5xl">{title}</h1>
            <p className="text-lg text-zinc-400">{artist}</p>
            <p className="text-sm text-zinc-600">Nessun testo disponibile per la sincronizzazione.</p>
          </>
        )}
      </div>
    </div>
  );
}
