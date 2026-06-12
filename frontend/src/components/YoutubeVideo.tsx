import { useRef, useState } from "react";
import { STAGE_PLAYER_FRAME_CLASS, STAGE_SHELL_CLASS, StageStartOverlay } from "./StageStartOverlay";

const base = import.meta.env.VITE_API_URL ?? "";

type Props = {
  /** Il video scaricato da yt-dlp è servito per prenotazione (/api/media/yt/:bookingId). */
  bookingId: string;
  title: string;
  /** Fine del video: il display la usa per chiudere l'esibizione da solo. */
  onEnded?: () => void;
};

/**
 * Video YouTube pre-scaricato sul server: riproduzione senza pubblicità.
 * Riempe tutto lo spazio disponibile: il display lascia in alto solo nome e voti.
 */
export function YoutubeVideo({ bookingId, title, onEnded }: Props) {
  const videoUrl = `${base}/api/media/yt/${encodeURIComponent(bookingId)}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
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
    <div className={STAGE_SHELL_CLASS}>
      <video
        ref={videoRef}
        className={`${STAGE_PLAYER_FRAME_CLASS} object-contain`}
        src={videoUrl}
        preload="auto"
        controls={started}
        onPlay={() => setStarted(true)}
        onEnded={() => onEnded?.()}
        onError={() => setError("Video non disponibile: riprova il download da /admin")}
      />
      {!started && (
        <StageStartOverlay
          title={title}
          badges={
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-widest text-emerald-200/90">
              🎬 video scaricato · senza pubblicità
            </span>
          }
          error={error}
          buttonLabel="▶ Avvia video"
          onStart={() => void start()}
          hint="Il browser richiede un tap su questo pulsante per avviare il video con l'audio."
        />
      )}
    </div>
  );
}
