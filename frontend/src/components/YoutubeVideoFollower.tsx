import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayTransportState } from "../lib/displayTransport";
import { STAGE_SHELL_CLASS } from "./StageStartOverlay";
import { StageConnectBar } from "./StageConnectBar";
import { loadYouTubeApi, youtubeVideoId } from "./YoutubeEmbed";

const base = import.meta.env.VITE_API_URL ?? "";

type YTFollowerPlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
};

type Props = {
  bookingId?: string | null;
  ytUrl?: string | null;
  title: string;
  connecting: boolean;
  connected: boolean;
  syncTarget: DisplayTransportState | null;
  onConnect: () => void;
};

function shouldPlayTransport(target: DisplayTransportState): boolean {
  return target.playing && !target.paused;
}

/** Video YouTube muto sul display guest: sync iniziale al tap «Connetti», poi play/pausa dal proiettore. */
export function YoutubeVideoFollower({
  bookingId,
  ytUrl,
  title,
  connecting,
  connected,
  syncTarget,
  onConnect,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<YTFollowerPlayer | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const syncAppliedRef = useRef(false);
  const lastPausedRef = useRef<boolean | null>(null);

  const [currentSec, setCurrentSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoUrl = bookingId ? `${base}/api/media/yt/${encodeURIComponent(bookingId)}` : null;
  const embedVideoId = ytUrl ? youtubeVideoId(ytUrl) : null;
  const useEmbed = !bookingId && Boolean(embedVideoId);

  const applyPlayPause = useCallback(
    (target: DisplayTransportState) => {
      const play = shouldPlayTransport(target);
      setPaused(!play);

      if (bookingId && videoRef.current) {
        if (play) void videoRef.current.play().catch(() => {});
        else videoRef.current.pause();
        return;
      }

      if (ytPlayerRef.current) {
        if (play) ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
      }
    },
    [bookingId]
  );

  useEffect(() => {
    syncAppliedRef.current = false;
    lastPausedRef.current = null;
    setCurrentSec(0);
    setPaused(false);
    setError(null);
    ytPlayerRef.current?.destroy();
    ytPlayerRef.current = null;
  }, [bookingId, ytUrl]);

  useEffect(() => {
    if (!syncTarget || syncAppliedRef.current) return;

    async function applyInitialSync() {
      if (bookingId && videoRef.current) {
        const video = videoRef.current;
        try {
          if (video.readyState < 1) {
            await new Promise<void>((resolve, reject) => {
              const onMeta = () => {
                cleanup();
                resolve();
              };
              const onErr = () => {
                cleanup();
                reject(new Error("Video non caricato"));
              };
              const cleanup = () => {
                video.removeEventListener("loadedmetadata", onMeta);
                video.removeEventListener("error", onErr);
              };
              video.addEventListener("loadedmetadata", onMeta);
              video.addEventListener("error", onErr);
            });
          }
          video.currentTime = syncTarget!.sec;
          video.muted = true;
          applyPlayPause(syncTarget!);
          syncAppliedRef.current = true;
          lastPausedRef.current = syncTarget!.paused;
          setCurrentSec(syncTarget!.sec);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Sync non riuscita");
        }
        return;
      }

      if (useEmbed && embedVideoId && ytHostRef.current) {
        try {
          const YTApi = await loadYouTubeApi();
          if (ytPlayerRef.current) {
            ytPlayerRef.current.destroy();
            ytPlayerRef.current = null;
          }
          const host = ytHostRef.current.firstElementChild as HTMLElement | null;
          if (!host) return;

          const player = new YTApi.Player(host, {
            videoId: embedVideoId,
            host: "https://www.youtube-nocookie.com",
            width: "100%",
            height: "100%",
            playerVars: { autoplay: 0, rel: 0, mute: 1, start: Math.floor(syncTarget!.sec) },
          }) as unknown as YTFollowerPlayer;

          ytPlayerRef.current = player;
          player.mute();
          player.seekTo(syncTarget!.sec, true);
          applyPlayPause(syncTarget!);
          syncAppliedRef.current = true;
          lastPausedRef.current = syncTarget!.paused;
          setCurrentSec(syncTarget!.sec);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Sync embed non riuscita");
        }
      }
    }

    void applyInitialSync();
  }, [syncTarget, bookingId, useEmbed, embedVideoId, applyPlayPause]);

  useEffect(() => {
    if (!connected || !syncTarget || !syncAppliedRef.current) return;
    if (lastPausedRef.current === syncTarget.paused) return;
    lastPausedRef.current = syncTarget.paused;
    applyPlayPause(syncTarget);
  }, [connected, syncTarget, applyPlayPause]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !connected) return;
    const onTime = () => setCurrentSec(video.currentTime);
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [connected, bookingId]);

  useEffect(() => {
    if (!connected || !useEmbed || !ytPlayerRef.current) return;
    const timer = window.setInterval(() => {
      try {
        const sec = ytPlayerRef.current?.getCurrentTime();
        if (typeof sec === "number" && Number.isFinite(sec)) setCurrentSec(sec);
      } catch {
        /* player non pronto */
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [connected, useEmbed, syncTarget]);

  useEffect(() => {
    return () => {
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        /* già distrutto */
      }
      ytPlayerRef.current = null;
    };
  }, []);

  if (!bookingId && !embedVideoId) {
    return (
      <div className={`${STAGE_SHELL_CLASS} flex items-center justify-center p-6 text-center`}>
        <p className="text-sm text-red-400">Video non disponibile su questo dispositivo.</p>
      </div>
    );
  }

  return (
    <div className={STAGE_SHELL_CLASS}>
      {bookingId ? (
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          src={videoUrl ?? undefined}
          crossOrigin="anonymous"
          preload="auto"
          playsInline
          muted
        />
      ) : (
        <div ref={ytHostRef} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full">
          <div />
        </div>
      )}

      {!connected && !connecting && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/50 px-6 text-center">
          <p className="font-display text-xl font-semibold text-white md:text-2xl">{title}</p>
          <p className="mt-3 max-w-xs text-sm text-zinc-400">
            Tocca <strong className="text-cyan-300">Connetti</strong> in basso quando il video parte sulla TV.
          </p>
        </div>
      )}

      {error && (
        <p className="absolute left-4 right-4 top-4 rounded-lg border border-red-500/40 bg-red-950/80 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <StageConnectBar
        connecting={connecting}
        connected={connected}
        paused={connected ? paused : undefined}
        currentSec={connected ? currentSec : undefined}
        onConnect={onConnect}
      />
    </div>
  );
}
