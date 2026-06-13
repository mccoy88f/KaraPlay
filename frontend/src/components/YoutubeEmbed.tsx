import { useEffect, useRef, useState } from "react";
import type { DisplayTransportTickFn } from "../lib/displayTransport";
import { STAGE_SHELL_CLASS, StageStartOverlay } from "./StageStartOverlay";

type YTPlayerWithTime = YTPlayer & {
  getCurrentTime: () => number;
  getPlayerState: () => number;
};

type Props = {
  ytUrl: string;
  title: string;
  /** Fine del video: il display la usa per chiudere l'esibizione da solo. */
  onEnded?: () => void;
  onTransportTick?: DisplayTransportTickFn;
};

/** Estrae l'id video dalle forme comuni di URL YouTube (watch, youtu.be, shorts, embed). */
export function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.hostname.endsWith("youtube.com") || u.hostname.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
      if (m) return m[2];
    }
  } catch {
    /* URL non valido */
  }
  return null;
}

/* IFrame Player API: serve per sapere quando il video finisce (l'iframe puro non lo dice). */
type YTPlayer = { destroy: () => void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: { onStateChange?: (e: { data: number }) => void };
    }
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

/**
 * Riproduce il video YouTube direttamente (l'audio è già nel video, niente download).
 * Parte dopo un click e riempe tutto lo spazio disponibile; a fine video chiama onEnded.
 */
export function YoutubeEmbed({ ytUrl, title, onEnded, onTransportTick }: Props) {
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onTransportTickRef = useRef(onTransportTick);
  onTransportTickRef.current = onTransportTick;
  const playerRef = useRef<YTPlayerWithTime | null>(null);
  const videoId = youtubeVideoId(ytUrl);

  const startedRef = useRef(started);
  startedRef.current = started;

  const emitTransport = (immediate = false) => {
    const player = playerRef.current;
    if (!player || !startedRef.current) return;
    try {
      const sec = player.getCurrentTime();
      const state = player.getPlayerState();
      const playing = state === 1;
      const paused = state === 2;
      onTransportTickRef.current?.(
        { sec, playing: startedRef.current && (playing || paused), paused },
        immediate
      );
    } catch {
      /* player non pronto */
    }
  };

  useEffect(() => {
    if (!started || !videoId) return;
    let cancelled = false;
    let player: YTPlayerWithTime | undefined;
    void loadYouTubeApi().then((YTApi) => {
      const host = containerRef.current?.firstElementChild as HTMLElement | null;
      if (cancelled || !host) return;
      player = new YTApi.Player(host, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, rel: 0 },
        events: {
          onStateChange: (e) => {
            if (e.data === YTApi.PlayerState.ENDED) onEndedRef.current?.();
            if (
              e.data === YTApi.PlayerState.PLAYING ||
              e.data === YTApi.PlayerState.PAUSED
            ) {
              emitTransport(true);
            }
          },
        },
      }) as YTPlayerWithTime;
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* già distrutto */
      }
    };
  }, [started, videoId]);

  useEffect(() => {
    if (!started || !onTransportTick) return;
    const timer = window.setInterval(() => emitTransport(false), 350);
    return () => window.clearInterval(timer);
  }, [started, onTransportTick]);

  if (!videoId) {
    return (
      <div className="flex max-w-2xl flex-col items-center gap-4">
        <h1 className="font-display text-4xl font-bold text-white">{title}</h1>
        <p className="text-sm text-red-400">URL YouTube non riconosciuto: {ytUrl}</p>
      </div>
    );
  }

  return (
    <div className={STAGE_SHELL_CLASS}>
      {started ? (
        <div ref={containerRef} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full">
          <div />
        </div>
      ) : (
        <StageStartOverlay
          title={title}
          badges={
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs uppercase tracking-widest text-red-200/90">
              🎬 YouTube
            </span>
          }
          buttonLabel="▶ Avvia video"
          onStart={() => setStarted(true)}
          hint="Il browser richiede un tap su questo pulsante per avviare il video con l'audio."
        />
      )}
    </div>
  );
}
