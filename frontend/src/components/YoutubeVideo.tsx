import { useCallback, useEffect, useRef, useState } from "react";
import { connectSoundTouchVideo, type SoundTouchVideoSession } from "../lib/soundtouchVideo";
import { STAGE_SHELL_CLASS, StageStartOverlay } from "./StageStartOverlay";
import { StageTransportBar } from "./StageTransportBar";

const base = import.meta.env.VITE_API_URL ?? "";
const CONTROLS_HIDE_MS = 3000;

type Props = {
  /** Il video scaricato da yt-dlp è servito per prenotazione (/api/media/yt/:bookingId). */
  bookingId: string;
  title: string;
  /** Trasposizione in semitoni (-12…+12). Modificabile live dalla console admin. */
  transposeSemitones?: number;
  /** Fine del video: il display la usa per chiudere l'esibizione da solo. */
  onEnded?: () => void;
};

/**
 * Video YouTube pre-scaricato sul server: riproduzione senza pubblicità.
 * Audio via SoundTouchJS (stessa logica tonalità dei brani MIDI).
 */
export function YoutubeVideo({ bookingId, title, transposeSemitones = 0, onEnded }: Props) {
  const videoUrl = `${base}/api/media/yt/${encodeURIComponent(bookingId)}`;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<SoundTouchVideoSession | null>(null);
  const transposeRef = useRef(transposeSemitones);
  const hideControlsTimerRef = useRef<number | null>(null);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [transportSec, setTransportSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    transposeRef.current = transposeSemitones;
    if (sessionRef.current) {
      sessionRef.current.node.pitchSemitones.value = transposeSemitones;
    }
  }, [transposeSemitones]);

  const bumpControlsVisibility = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current != null) window.clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  async function ensureSession() {
    const video = videoRef.current;
    if (!video || sessionRef.current) return;
    sessionRef.current = await connectSoundTouchVideo(video, transposeRef.current);
  }

  async function start() {
    setError(null);
    const video = videoRef.current;
    if (!video) return;
    try {
      await ensureSession();
      await sessionRef.current!.ctx.resume();
      await video.play();
      setStarted(true);
      setPaused(false);
      bumpControlsVisibility();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riproduzione non avviata");
    }
  }

  function togglePause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
    bumpControlsVisibility();
  }

  function restart() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setTransportSec(0);
    setPaused(false);
    void video.play().catch(() => {});
    bumpControlsVisibility();
  }

  function seekTo(sec: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = sec;
    setTransportSec(sec);
    bumpControlsVisibility();
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setPaused(false);
      setTransportSec(0);
      onEnded?.();
    };
    const onLoaded = () => setDurationSec(Number.isFinite(video.duration) ? video.duration : 0);
    const onTime = () => setTransportSec(video.currentTime);
    const onPlay = () => setPaused(false);
    const onPause = () => {
      if (video.currentTime >= Math.max(0, video.duration - 0.25)) return;
      setPaused(true);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [onEnded]);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current != null) window.clearTimeout(hideControlsTimerRef.current);
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  return (
    <div
      className={STAGE_SHELL_CLASS}
      onMouseMove={started ? bumpControlsVisibility : undefined}
      onTouchStart={started ? bumpControlsVisibility : undefined}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={videoUrl}
        preload="auto"
        playsInline
      />
      {started ? (
        <StageTransportBar
          visible={controlsVisible || paused}
          paused={paused}
          currentSec={transportSec}
          durationSec={durationSec}
          onSeek={seekTo}
          onTogglePause={togglePause}
          onRestart={restart}
        />
      ) : (
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
