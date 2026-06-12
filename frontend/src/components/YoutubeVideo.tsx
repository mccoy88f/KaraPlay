import { useRef, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

type Props = {
  /** Il video scaricato da yt-dlp è servito per prenotazione (/api/media/yt/:bookingId). */
  bookingId: string;
  title: string;
};

/**
 * Video YouTube pre-scaricato sul server: riproduzione senza pubblicità.
 * Riempe tutto lo spazio disponibile: il display lascia in alto solo nome e voti.
 */
export function YoutubeVideo({ bookingId, title }: Props) {
  const videoUrl = `${base}/api/media/yt/${encodeURIComponent(bookingId)}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    try {
      await videoRef.current?.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riproduzione non avviata");
    }
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/60">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={videoUrl}
        preload="auto"
        controls={playing}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError("Video non disponibile: riprova il download da /admin")}
      />
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
          <p className="font-display max-w-3xl text-2xl font-semibold text-white md:text-4xl">{title}</p>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-widest text-emerald-200/90">
            🎬 video scaricato · senza pubblicità
          </span>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-red-900/40 hover:bg-red-500"
          >
            ▶ Avvia video
          </button>
          <p className="text-xs text-zinc-400">Il browser richiede un tap per avviare il video con l&apos;audio.</p>
        </div>
      )}
    </div>
  );
}
