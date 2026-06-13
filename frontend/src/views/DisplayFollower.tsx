import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import {
  apiGetEventById,
  apiGetLivePerformance,
  getStoredEvent,
  getStoredNickname,
} from "../api/client";
import type { DisplayTransportPayload, DisplayTransportState } from "../lib/displayTransport";
import { isGuestSessionValid, reconcileGuestSession } from "../lib/authSession";
import { KaraokeLyricsFollower } from "../components/KaraokeLyricsFollower";
import { YoutubeVideoFollower } from "../components/YoutubeVideoFollower";
import { useI18n } from "../i18n/context";

const socketUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");
const SYNC_TIMEOUT_MS = 8000;

type LiveState = {
  performanceId: string;
  nickname: string;
  title: string;
  artist: string;
  source?: string;
  songId?: string;
  lrcPath?: string | null;
  bookingId?: string | null;
  ytUrl?: string | null;
  isYoutube: boolean;
};

type VideoSyncState = {
  connecting: boolean;
  connected: boolean;
  target: DisplayTransportState | null;
  error: string | null;
};

/** /display senza ?eventId= — segue il palco senza audio (serata del join guest). */
export function DisplayFollower() {
  const { t } = useI18n();
  const storedEvent = getStoredEvent();
  const eventId = storedEvent?.id ?? null;
  const nickname = getStoredNickname();
  const sessionOk = isGuestSessionValid(eventId);

  const [eventName, setEventName] = useState(storedEvent?.name ?? "");
  const [live, setLive] = useState<LiveState | null>(null);
  const [transport, setTransport] = useState<{ sec: number; synced: boolean }>({ sec: 0, synced: false });
  const [videoSync, setVideoSync] = useState<VideoSyncState>({
    connecting: false,
    connected: false,
    target: null,
    error: null,
  });
  const [lastScore, setLastScore] = useState<number | null>(null);

  const liveRef = useRef<LiveState | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const videoSyncRef = useRef(videoSync);
  liveRef.current = live;
  videoSyncRef.current = videoSync;

  const isPerformer = Boolean(nickname && live?.nickname && nickname === live.nickname);
  const youtubeSyncAvailable = Boolean(live?.source === "YOUTUBE" && live.bookingId);
  const youtubeEmbedOnly = Boolean(live?.isYoutube && !youtubeSyncAvailable);

  useEffect(() => {
    reconcileGuestSession();
  }, []);

  const resetVideoSync = useCallback(() => {
    setVideoSync({ connecting: false, connected: false, target: null, error: null });
  }, []);

  const requestVideoSync = useCallback(() => {
    const perfId = liveRef.current?.performanceId;
    if (!perfId) return;
    setVideoSync({ connecting: true, connected: false, target: null, error: null });
    socketRef.current?.emit("display:sync-request", { performanceId: perfId });
  }, []);

  useEffect(() => {
    if (!eventId || !sessionOk) return;

    let socket: Socket | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const info = await apiGetEventById(eventId);
        if (!cancelled) setEventName(info.name);
        const { live: liveNow } = await apiGetLivePerformance(eventId);
        if (cancelled || !liveNow) return;
        setLive(mapLive(liveNow));
        setTransport({ sec: 0, synced: false });
        resetVideoSync();
      } catch {
        /* socket riallinea */
      }
    })();

    socket = io(socketUrl, { path: "/socket.io", transports: ["polling", "websocket"] });
    socketRef.current = socket;
    socket.emit("event:join", { eventId });
    socket.on("connect", () => socket?.emit("event:join", { eventId }));

    socket.on("performance:start", (payload: {
      performance: { id: string };
      song: { id: string; title: string; artist: string; source?: string; lrcPath?: string | null } | null;
      user: { nickname: string };
      booking?: { id?: string; ytTitle?: string | null; ytUrl?: string | null } | null;
    }) => {
      setLive(mapLive(payload));
      setTransport({ sec: 0, synced: false });
      resetVideoSync();
      setLastScore(null);
    });

    socket.on("performance:end", (payload: { score?: number }) => {
      setLive(null);
      setTransport({ sec: 0, synced: false });
      resetVideoSync();
      if (typeof payload?.score === "number") setLastScore(payload.score);
    });

    socket.on("display:transport", (payload: DisplayTransportPayload) => {
      if (payload.performanceId !== liveRef.current?.performanceId) return;

      if (liveRef.current?.source === "MIDI") {
        setTransport({ sec: payload.sec, synced: true });
        return;
      }

      if (!liveRef.current?.isYoutube) return;
      if (liveRef.current.source !== "YOUTUBE" || !liveRef.current.bookingId) return;

      const target = { sec: payload.sec, playing: payload.playing, paused: payload.paused };

      if (videoSyncRef.current.connecting) {
        setVideoSync({
          connecting: false,
          connected: true,
          target,
          error: null,
        });
        return;
      }

      if (videoSyncRef.current.connected) {
        setVideoSync((prev) => ({ ...prev, target }));
      }
    });

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [eventId, sessionOk, resetVideoSync]);

  useEffect(() => {
    if (!videoSync.connecting) return;
    const timer = window.setTimeout(() => {
      setVideoSync((prev) =>
        prev.connecting
          ? { connecting: false, connected: false, target: null, error: t("displayFollower.projectorTimeout") }
          : prev
      );
    }, SYNC_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [videoSync.connecting, live?.performanceId, t]);

  if (!sessionOk || !eventId) {
    return (
      <div className="kg-page-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xs uppercase tracking-[0.35em] text-cyan-400/90">{t("displayFollower.followStage")}</p>
        <h1 className="font-display mt-4 text-2xl font-semibold text-white">{t("displayFollower.enterTitle")}</h1>
        <p className="mt-3 max-w-md text-sm text-zinc-400">{t("displayFollower.enterHint")}</p>
        <p className="mt-2 max-w-md text-sm text-zinc-500">{t("displayFollower.presenterHint")}</p>
        <Link
          to="/join/enter"
          className="mt-8 rounded-xl bg-fuchsia-600 px-6 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500"
        >
          {t("displayFollower.enterPin")}
        </Link>
        <Link to="/join" className="mt-4 text-sm text-zinc-500 hover:text-zinc-300">
          {t("displayFollower.publicArea")}
        </Link>
      </div>
    );
  }

  return (
    <div className="kg-page-bg flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/40 px-4 py-3 backdrop-blur-md">
        <div className="text-left">
          <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-cyan-400/90">{t("displayFollower.followStage")}</p>
          <p className="mt-0.5 text-sm text-zinc-300">
            {nickname ? (
              <>
                {t("displayFollower.hello")} <span className="text-white">{nickname}</span>
              </>
            ) : (
              t("displayFollower.silentMode")
            )}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {live?.isYoutube ? t("displayFollower.noAudioVideo") : t("displayFollower.noAudioMidi")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-sm font-semibold text-zinc-100">{eventName || storedEvent?.name}</p>
          <Link to="/join" className="mt-1 inline-block text-xs text-fuchsia-400 hover:underline">
            {t("displayFollower.voteFrom")}
          </Link>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-3 py-3 md:px-6">
        {live ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="shrink-0 text-center">
              <p className="text-sm text-zinc-400">
                <span className="font-semibold text-white">{live.nickname}</span>
                <span className="text-zinc-600"> · </span>
                {live.title}
                {live.artist ? <span className="text-zinc-500"> — {live.artist}</span> : null}
              </p>
            </div>
            {live.source === "MIDI" && live.songId ? (
              <KaraokeLyricsFollower
                key={live.performanceId}
                songId={live.songId}
                title={live.title}
                artist={live.artist}
                lrcPath={live.lrcPath}
                transportSec={transport.sec}
                synced={transport.synced}
              />
            ) : live.isYoutube && youtubeEmbedOnly && isPerformer ? (
              <div
                className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center md:p-10"
                role="status"
              >
                <p className="max-w-md text-base leading-relaxed text-amber-50 md:text-lg">{t("displayFollower.embedNoSync")}</p>
              </div>
            ) : live.isYoutube && youtubeSyncAvailable ? (
              <>
                {videoSync.error && (
                  <p className="shrink-0 text-center text-sm text-amber-300" role="status">
                    {videoSync.error}
                  </p>
                )}
                <YoutubeVideoFollower
                  key={live.performanceId}
                  bookingId={live.bookingId}
                  ytUrl={live.ytUrl}
                  title={live.title}
                  connecting={videoSync.connecting}
                  connected={videoSync.connected}
                  syncTarget={videoSync.target}
                  onConnect={requestVideoSync}
                />
              </>
            ) : live.isYoutube ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-black p-6 text-center">
                <p className="font-display text-2xl font-semibold text-white md:text-3xl">{live.title}</p>
                {live.artist && <p className="mt-2 text-zinc-400">{live.artist}</p>}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-black p-6 text-center">
                <p className="font-display text-2xl font-semibold text-white md:text-3xl">{live.title}</p>
                {live.artist && <p className="mt-2 text-zinc-400">{live.artist}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            {lastScore !== null ? (
              <>
                <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/90">{t("displayFollower.lastScore")}</p>
                <p className="font-display text-6xl font-bold text-white">{lastScore.toFixed(1)}</p>
              </>
            ) : (
              <>
                <h1 className="font-display text-2xl font-semibold text-white">{t("displayFollower.waiting")}</h1>
                <p className="max-w-sm text-sm text-zinc-500">{t("displayFollower.waitingHint")}</p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function mapLive(payload: {
  performance: { id: string };
  song: { id: string; title: string; artist: string; source?: string; lrcPath?: string | null } | null;
  user: { nickname: string };
  booking?: { id?: string; ytTitle?: string | null; ytUrl?: string | null } | null;
}): LiveState {
  const isYoutube = payload.song?.source === "YOUTUBE" || Boolean(payload.booking?.ytUrl);
  return {
    performanceId: payload.performance.id,
    nickname: payload.user.nickname,
    title: payload.song?.title ?? payload.booking?.ytTitle ?? "Brano",
    artist: payload.song?.artist ?? "",
    source: payload.song?.source,
    songId: payload.song?.id,
    lrcPath: payload.song?.lrcPath,
    bookingId: payload.booking?.id ?? null,
    ytUrl: payload.booking?.ytUrl ?? null,
    isYoutube,
  };
}
