import { useEffect, useMemo, useRef, useState } from "react";
import { currentLrcIndex, parseLrc, type LrcLine } from "../lib/lrc";
import { LyricsPanel } from "./LyricsPanel";

const base = import.meta.env.VITE_API_URL ?? "";

type Props = {
  /** L'audio scaricato da yt-dlp è servito per prenotazione, non per canzone. */
  bookingId: string;
  songId: string;
  title: string;
  artist: string;
  lrcPath?: string | null;
};

/** Player per i brani YouTube già elaborati: audio opus dal server + testi LRC sincronizzati. */
export function YoutubePlayer({ bookingId, songId, title, artist, lrcPath }: Props) {
  const audioUrl = `${base}/api/media/yt/${encodeURIComponent(bookingId)}`;
  const lrcUrl = lrcPath ? `${base}/api/media/song/${encodeURIComponent(songId)}/lrc` : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const [timeSec, setTimeSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
        /* senza testi si vede solo il titolo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lrcUrl]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      setTimeSec(audioRef.current?.currentTime ?? 0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  async function start() {
    setError(null);
    try {
      await audioRef.current?.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riproduzione non avviata");
    }
  }

  const idx = useMemo(() => currentLrcIndex(lrcLines, timeSec), [lrcLines, timeSec]);

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8">
      <div>
        <p className="text-lg text-zinc-300">
          <span className="font-semibold text-white">{artist}</span>
        </p>
        <h1 className="mt-1 text-4xl font-bold text-white md:text-6xl">{title}</h1>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-red-200/90">
            Karaoke YouTube
          </span>
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTimeSec(0);
        }}
        onError={() => setError("Audio non disponibile: l'host deve completare l'elaborazione YouTube")}
      />

      {!playing && (
        <div className="flex max-w-lg flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-red-900/40 hover:bg-red-500"
          >
            Avvia karaoke
          </button>
          <p className="text-center text-xs text-zinc-500">
            Il browser richiede un tap su questo pulsante per l&apos;audio.
          </p>
        </div>
      )}

      <LyricsPanel
        lines={lrcLines}
        index={idx}
        title={title}
        noLyricsHint="Nessun testo sincronizzato trovato su LRCLIB per questo brano: parte solo l'audio."
      />
    </div>
  );
}
