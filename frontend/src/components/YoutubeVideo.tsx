import { useEffect, useRef, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

type Props = {
  /** Il video scaricato da yt-dlp è servito per prenotazione (/api/media/yt/:bookingId). */
  bookingId: string;
  title: string;
  nickname?: string;
  onTick?: (t: number) => void;
};

/** Video YouTube pre-scaricato sul server: riproduzione senza pubblicità. */
export function YoutubeVideo({ bookingId, title, nickname, onTick }: Props) {
  const videoUrl = `${base}/api/media/yt/${encodeURIComponent(bookingId)}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      onTick?.(videoRef.current?.currentTime ?? 0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, onTick]);

  async function start() {
    setError(null);
    try {
      await videoRef.current?.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riproduzione non avviata");
    }
  }

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-white md:text-5xl">{title}</h1>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-widest text-zinc-500">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-200/90">
            🎬 Video scaricato · senza pubblicità
          </span>
          {nickname && (
            <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-zinc-400">
              {nickname}
            </span>
          )}
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/60">
        <video
          ref={videoRef}
          className="h-full w-full"
          src={videoUrl}
          preload="auto"
          controls={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError("Video non disponibile: riprova il download da /admin")}
        />
        {!playing && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <button
              type="button"
              onClick={() => void start()}
              className="rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-red-900/40 hover:bg-red-500"
            >
              ▶ Avvia video
            </button>
            <p className="text-center text-xs text-zinc-400">
              Il browser richiede un tap per avviare il video con l&apos;audio.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
