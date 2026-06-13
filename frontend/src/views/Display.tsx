import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import confetti from "canvas-confetti";
import { KaraokePlayer } from "../components/KaraokePlayer";
import { YoutubeEmbed } from "../components/YoutubeEmbed";
import { YoutubeVideo } from "../components/YoutubeVideo";
import {
  apiGetEventById,
  apiGetEventLeaderboard,
  apiGetLivePerformance,
  apiGetQueue,
  apiGetVotes,
  type LeaderboardEntry,
} from "../api/client";
import type { SoundfontBankId } from "../lib/soundfontBanks";
import { getSoundfontBank } from "../lib/soundfontBanks";
import { useI18n } from "../i18n/context";
import { DisplayFollower } from "./DisplayFollower";

type SongPayload = {
  id: string;
  title: string;
  artist: string;
  source?: string;
  midiPath?: string | null;
  lrcPath?: string | null;
  mutedTrack?: number | null;
  transposeSemitones?: number;
};

type PerfPayload = {
  performance: { id: string };
  booking?: { id: string; ytUrl?: string | null; ytTitle?: string | null } | null;
  song: SongPayload | null;
  user: { nickname: string };
};

type QueueItem = {
  id: string;
  status: string;
  ytTitle?: string | null;
  user: { nickname: string };
  song: { title: string; artist: string } | null;
};

type OverlayComment = {
  id: string;
  nickname: string;
  text: string;
  emoji: string | null;
  expiresAt: number;
};

type EventInfo = {
  name: string;
  location: string;
  joinCode: string;
};

const base = import.meta.env.VITE_API_URL ?? "";
const socketUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");
const ADMIN_TOKEN_KEY = "karaoke_admin_jwt";
const MEDALS = ["🥇", "🥈", "🥉"];
const COMMENT_TTL_MS = 9000;

/** Festeggia il punteggio: tre lanci di coriandoli dal basso verso il centro. */
function fireScoreConfetti() {
  const fire = (x: number, angle: number) =>
    confetti({
      particleCount: 120,
      spread: 75,
      startVelocity: 55,
      angle,
      origin: { x, y: 0.9 },
      colors: ["#e879f9", "#22d3ee", "#fbbf24", "#34d399", "#f87171"],
    });
  fire(0.2, 60);
  fire(0.8, 120);
  window.setTimeout(() => fire(0.5, 90), 350);
}

export function Display() {
  const [searchParams] = useSearchParams();
  const eventIdParam = searchParams.get("eventId");
  if (!eventIdParam) {
    return <DisplayFollower />;
  }
  return <DisplayPresenter eventId={eventIdParam} />;
}

/** Schermo sala del presentatore: richiede ?eventId= e login admin. */
function DisplayPresenter({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  // Lo schermo sala è del presentatore: serve il login admin e la serata deve essere sua.
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [auth, setAuth] = useState<"checking" | "login" | "denied" | "ok">("checking");
  const [loginUser, setLoginUser] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sfBank, setSfBank] = useState<SoundfontBankId>(() => getSoundfontBank(null).id);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [live, setLive] = useState<PerfPayload | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [voteAvg, setVoteAvg] = useState<number | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [comments, setComments] = useState<OverlayComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ytHint, setYtHint] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const liveRef = useRef<PerfPayload | null>(null);
  liveRef.current = live;
  const lastTransportEmitRef = useRef(0);
  const transportSnapshotRef = useRef({ sec: 0, playing: false, paused: false });

  const emitDisplayTransport = useCallback(
    (state: { sec: number; playing: boolean; paused: boolean }, immediate = false) => {
      transportSnapshotRef.current = state;
      const perfId = liveRef.current?.performance.id;
      if (!perfId) return;
      const now = Date.now();
      if (!immediate && now - lastTransportEmitRef.current < 350) return;
      lastTransportEmitRef.current = now;
      socketRef.current?.emit("display:transport", {
        performanceId: perfId,
        ...state,
      });
    },
    []
  );

  const emitDisplayTransportImmediate = useCallback((performanceId: string) => {
    const snap = transportSnapshotRef.current;
    socketRef.current?.emit("display:transport", {
      performanceId,
      ...snap,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!adminToken) {
      setAuth("login");
      return;
    }
    setAuth("checking");
    void (async () => {
      try {
        const res = await fetch(`${base}/api/admin/events`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          setAdminToken(null);
          setAuth("login");
          return;
        }
        const events = (data as { events?: { id: string }[] }).events ?? [];
        setAuth(!eventId || events.some((e) => e.id === eventId) ? "ok" : "denied");
      } catch {
        if (!cancelled) setAuth("login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, eventId]);

  async function displayLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr(null);
    setLoginBusy(true);
    try {
      const res = await fetch(`${base}/api/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser.trim(), password: loginPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginErr((data as { error?: string }).error ?? t("admin.loginFailed"));
        return;
      }
      const token = (data as { token: string }).token;
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      setAdminToken(token);
      setLoginPw("");
    } finally {
      setLoginBusy(false);
    }
  }

  /** Fine naturale del brano: lo schermo (autenticato) chiude l'esibizione da solo. */
  const endingRef = useRef(false);
  const autoEnd = useCallback(async () => {
    const perfId = liveRef.current?.performance.id;
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!perfId || !token || endingRef.current) return;
    endingRef.current = true;
    try {
      await fetch(`${base}/api/admin/performances/${encodeURIComponent(perfId)}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // performance:end arriva via socket: punteggio, coriandoli e schermata d'attesa
    } catch {
      endingRef.current = false;
    }
  }, []);

  // Scadenza commenti overlay
  useEffect(() => {
    if (comments.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setComments((prev) => prev.filter((c) => c.expiresAt > now));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [comments.length]);

  // Fallback se il WebSocket non consegna mute/tonalità live (proxy senza upgrade, ecc.)
  useEffect(() => {
    if (!eventId || !live?.performance?.id) return;
    let cancelled = false;
    const syncLiveSongSettings = async () => {
      try {
        const { live: liveNow } = await apiGetLivePerformance(eventId);
        if (cancelled || !liveNow?.song) return;
        const songNow = liveNow.song;
        setLive((prev) => {
          if (!prev || prev.performance.id !== liveNow.performance.id || !prev.song) return prev;
          const nextMuted = songNow.mutedTrack ?? null;
          const nextTranspose = songNow.transposeSemitones ?? 0;
          const prevMuted = prev.song.mutedTrack ?? null;
          const prevTranspose = prev.song.transposeSemitones ?? 0;
          if (prevMuted === nextMuted && prevTranspose === nextTranspose) return prev;
          return {
            ...prev,
            song: { ...prev.song, mutedTrack: nextMuted, transposeSemitones: nextTranspose },
          };
        });
      } catch {
        /* riprova al prossimo tick */
      }
    };
    void syncLiveSongSettings();
    const timer = window.setInterval(() => void syncLiveSongSettings(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eventId, live?.performance?.id]);

  useEffect(() => {
    if (!eventId) return;
    const id = eventId;

    let socket: Socket | undefined;
    let cancelled = false;

    async function bootstrap() {
      try {
        const info = await apiGetEventById(id);
        if (cancelled) return;
        setEventInfo({ name: info.name, location: info.location, joinCode: info.joinCode });
        const joinUrl = `${window.location.origin}/join/enter?pin=${encodeURIComponent(info.joinCode)}`;
        QRCode.toDataURL(joinUrl, { margin: 1, width: 280, color: { dark: "#18181b", light: "#fafafa" } })
          .then((url) => {
            if (!cancelled) setQrDataUrl(url);
          })
          .catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("admin.display.eventNotFound"));
        return;
      }

      try {
        const q = await apiGetQueue(id);
        if (cancelled) return;
        setQueue((q.queue as QueueItem[]) ?? []);
        if (q.soundfontBankId) {
          setSfBank(getSoundfontBank(q.soundfontBankId).id);
        }
        const { live: liveNow } = await apiGetLivePerformance(id);
        if (cancelled) return;
        if (liveNow) {
          setLive({
            performance: liveNow.performance,
            booking: liveNow.booking ?? null,
            song: liveNow.song,
            user: liveNow.user,
          });
          setLastScore(null);
          try {
            const stats = await apiGetVotes(liveNow.performance.id);
            if (!cancelled) {
              setVoteAvg(stats.count > 0 ? stats.avg : null);
              setVoteCount(stats.count);
            }
          } catch {
            /* arriverà via socket */
          }
        }
        const lb = await apiGetEventLeaderboard(id);
        if (!cancelled) setLeaderboard(lb.entries);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("admin.display.queueError"));
      }

      socket = io(socketUrl, { path: "/socket.io", transports: ["polling", "websocket"] });
      socketRef.current = socket;
      socket.emit("event:join", { eventId: id });
      socket.emit("display:ready");
      socket.on("connect", () => {
        socket?.emit("event:join", { eventId: id });
      });

      socket.on("queue:update", (payload: { queue: QueueItem[] }) => {
        setQueue(payload.queue ?? []);
      });

      socket.on("performance:start", (payload: PerfPayload) => {
        endingRef.current = false;
        setLive(payload);
        setLastScore(null);
        setVoteAvg(null);
        setVoteCount(0);
        setComments([]);
      });

      socket.on("performance:end", (payload: { score?: number }) => {
        setLive(null);
        setVoteAvg(null);
        setVoteCount(0);
        if (typeof payload?.score === "number") {
          setLastScore(payload.score);
          fireScoreConfetti();
        }
      });

      socket.on("vote:update", (payload: { performanceId: string; avg: number; count: number }) => {
        if (payload.performanceId !== liveRef.current?.performance.id) return;
        setVoteAvg(payload.count > 0 ? payload.avg : null);
        setVoteCount(payload.count);
      });

      socket.on(
        "comment:new",
        (payload: {
          performanceId: string;
          comment: { id: string; text: string; emoji: string | null };
          user: { nickname: string };
        }) => {
          if (payload.performanceId !== liveRef.current?.performance.id) return;
          setComments((prev) =>
            [
              ...prev,
              {
                id: payload.comment.id,
                nickname: payload.user.nickname,
                text: payload.comment.text,
                emoji: payload.comment.emoji,
                expiresAt: Date.now() + COMMENT_TTL_MS,
              },
            ].slice(-5)
          );
        }
      );

      socket.on("leaderboard:update", (payload: { entries: LeaderboardEntry[] }) => {
        setLeaderboard(payload.entries ?? []);
      });

      socket.on("display:sync-request", (payload: { performanceId?: string }) => {
        const perfId = payload?.performanceId;
        if (!perfId || perfId !== liveRef.current?.performance.id) return;
        emitDisplayTransportImmediate(perfId);
      });

      // la console può cambiare la traccia silenziata anche a brano in corso
      socket.on("song:muted-track", (payload: { songId: string; mutedTrack: number | null }) => {
        setLive((prev) =>
          prev?.song?.id === payload.songId
            ? { ...prev, song: { ...prev.song, mutedTrack: payload.mutedTrack } }
            : prev
        );
      });

      socket.on("song:transpose-semitones", (payload: { songId: string; transposeSemitones: number }) => {
        setLive((prev) =>
          prev?.song?.id === payload.songId
            ? { ...prev, song: { ...prev.song, transposeSemitones: payload.transposeSemitones } }
            : prev
        );
      });

      socket.on("youtube:processing", (payload: { progress: number }) => {
        setYtHint(t("admin.display.youtubeDownloading", { progress: payload.progress }));
      });
      socket.on("youtube:ready", () => {
        setYtHint(t("admin.display.youtubeReady"));
        window.setTimeout(() => setYtHint(null), 5000);
      });
      socket.on("youtube:error", (payload: { error?: string }) => {
        setYtHint(
          t("admin.display.youtubeDownloadFailed", {
            error: payload?.error ?? t("admin.display.youtubeErrorFallback"),
          })
        );
        window.setTimeout(() => setYtHint(null), 8000);
      });
    }

    bootstrap().catch(() => setError(t("admin.display.connectionFailed")));

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [eventId, t]);

  if (auth === "checking") {
    return (
      <div className="kg-page-bg flex min-h-dvh items-center justify-center">
        <p className="text-sm text-zinc-500">{t("admin.checking")}</p>
      </div>
    );
  }

  if (auth === "login") {
    return (
      <div className="kg-page-bg flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <header className="mb-8 text-center">
            <p className="font-display text-xs uppercase tracking-[0.35em] text-amber-300/90">{t("admin.display.title")}</p>
            <h1 className="font-display mt-3 text-2xl font-semibold text-white">{t("admin.display.loginTitle")}</h1>
            <p className="mt-3 text-sm text-zinc-400">{t("admin.display.loginHint")}</p>
          </header>
          <form onSubmit={displayLogin} className="kg-card flex flex-col gap-4 p-6">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-zinc-400">{t("admin.username")}</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none ring-amber-500/30 focus:ring-2"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-zinc-400">{t("admin.password")}</span>
              <input
                type="password"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none ring-amber-500/30 focus:ring-2"
                value={loginPw}
                onChange={(e) => setLoginPw(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {loginErr && <p className="text-sm text-red-400">{loginErr}</p>}
            <button
              type="submit"
              disabled={loginBusy || !loginUser.trim() || !loginPw}
              className="font-display mt-1 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3 font-semibold text-white hover:from-amber-500 hover:to-amber-400 disabled:opacity-40"
            >
              {loginBusy ? t("admin.loggingIn") : t("admin.display.openDisplay")}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-600">
            <Link to="/join" className="hover:text-zinc-400">
              {t("admin.publicArea")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (auth === "denied") {
    return (
      <div className="kg-page-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xs uppercase tracking-[0.4em] text-amber-300/90">{t("admin.display.title")}</p>
        <h1 className="font-display mt-6 text-2xl font-semibold text-white">{t("admin.display.deniedTitle")}</h1>
        <p className="mt-4 max-w-md text-zinc-400">{t("admin.display.deniedHint")}</p>
        <Link to="/admin" className="mt-8 text-sm text-cyan-400 hover:underline">
          {t("admin.display.goToPanel")}
        </Link>
      </div>
    );
  }

  const upNext = queue.filter((b) => b.status === "APPROVED" || b.status === "READY").slice(0, 3);
  const queueLen = queue.filter((b) => !["DONE", "REJECTED", "SKIPPED"].includes(b.status)).length;

  return (
    <div className="kg-page-bg flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800/80 bg-zinc-950/40 px-4 py-3 backdrop-blur-md md:px-8 md:py-4">
        <div className="min-w-0 flex-1 text-left">
          {live ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="font-display text-lg text-zinc-300 md:text-xl">
                <span className="font-semibold text-white">{live.user.nickname}</span>
                <span className="text-zinc-500"> · </span>
                <span className="text-fuchsia-300/90">{t("live.onStage")}</span>
              </p>
              <p className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-200 md:px-4 md:py-1.5">
                ★{" "}
                <span className="font-display text-base font-semibold md:text-lg">
                  {voteAvg != null ? voteAvg.toFixed(1) : "—"}
                </span>
                <span className="ml-2 text-xs text-amber-200/70">
                  ({voteCount} {voteCount === 1 ? t("common.vote") : t("common.votes")})
                </span>
              </p>
              <p className="max-w-md text-sm text-zinc-500 md:max-w-xl">
                {live.song?.title ?? live.booking?.ytTitle ?? ""}
                {live.song?.source === "MIDI" && live.song.artist ? ` — ${live.song.artist}` : ""}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3 md:gap-4">
              {eventInfo && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-left">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t("join.enter.pin")}</p>
                  <p className="font-display text-2xl font-semibold tracking-[0.2em] text-fuchsia-300">
                    {eventInfo.joinCode}
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-left">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t("admin.display.inQueue")}</p>
                <p className="font-display text-2xl font-semibold tabular-nums text-cyan-300">{queueLen}</p>
              </div>
            </div>
          )}
        </div>

        {eventInfo && (
          <div className="shrink-0 max-w-[45%] text-right">
            <p className="font-display text-sm font-semibold leading-snug text-zinc-100 md:text-base">
              {eventInfo.name}
            </p>
            {eventInfo.location && eventInfo.location !== "—" && (
              <p className="mt-0.5 text-xs leading-snug text-zinc-500 md:text-sm">{eventInfo.location}</p>
            )}
          </div>
        )}
      </header>

      <main
        className={`flex min-h-0 flex-1 flex-col text-center ${
          live ? "overflow-hidden px-4 py-3 md:px-10 md:py-4" : "overflow-y-auto px-4 py-8 md:px-10"
        }`}
      >
        {error && <p className="text-sm text-red-400">{error}</p>}
        {ytHint && (
          <p className="text-sm text-amber-200/90" role="status">
            {ytHint}
          </p>
        )}

        {live ? (
          <div className="flex min-h-0 w-full flex-1 flex-col">
            {live.song?.source === "MIDI" && live.song.midiPath ? (
                <KaraokePlayer
                  key={live.performance.id}
                  songId={live.song.id}
                  title={live.song.title}
                  artist={live.song.artist}
                  lrcPath={live.song.lrcPath}
                  mutedTrack={live.song.mutedTrack}
                  transposeSemitones={live.song.transposeSemitones ?? 0}
                  soundfontBankId={sfBank}
                  onTransportTick={emitDisplayTransport}
                  onEnded={() => void autoEnd()}
                />
              ) : live.song?.source === "YOUTUBE" && live.booking?.id ? (
                <YoutubeVideo
                  key={live.performance.id}
                  bookingId={live.booking.id}
                  title={live.song.title}
                  transposeSemitones={live.song.transposeSemitones ?? 0}
                  onTransportTick={emitDisplayTransport}
                  onEnded={() => void autoEnd()}
                />
              ) : live.booking?.ytUrl ? (
                <YoutubeEmbed
                  key={live.performance.id}
                  ytUrl={live.booking.ytUrl}
                  title={live.booking.ytTitle ?? live.song?.title ?? t("admin.display.youtubeTrack")}
                  onTransportTick={emitDisplayTransport}
                  onEnded={() => void autoEnd()}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
                  <h1 className="font-display text-4xl font-bold text-white md:text-6xl">
                    {live.song ? live.song.title : t("admin.display.track")}
                  </h1>
                  {live.song && <p className="text-xl text-zinc-400">{live.song.artist}</p>}
                </div>
              )}

            {comments.length > 0 && (
              <div className="mt-3 w-full shrink-0 border-t border-zinc-700/80 bg-zinc-950/95 px-4 py-3 backdrop-blur-md md:px-8 md:py-4">
                <div className="flex items-center gap-5 overflow-hidden whitespace-nowrap md:gap-8">
                  <span className="shrink-0 text-xl md:text-2xl" aria-hidden>
                    💬
                  </span>
                  {comments.map((c) => (
                    <p key={c.id} className="kg-comment-in shrink-0 text-lg md:text-xl">
                      {c.emoji && c.text !== c.emoji ? <span className="mr-1.5">{c.emoji}</span> : null}
                      <span className="font-semibold text-fuchsia-300">{c.nickname}</span>{" "}
                      <span className="text-zinc-100">{c.text}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid flex-1 gap-8 py-8 lg:grid-cols-[1fr_minmax(280px,360px)]">
            <div className="flex flex-col items-center justify-center gap-6">
              {lastScore !== null ? (
                <>
                  <p className="font-display text-xl uppercase tracking-[0.3em] text-fuchsia-300/90">{t("admin.display.score")}</p>
                  <p className="kg-score-pop font-display text-8xl font-bold text-white drop-shadow-[0_0_40px_rgba(232,121,249,0.35)]">
                    {lastScore.toFixed(1)}
                  </p>
                </>
              ) : (
                <h1 className="font-display max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
                  {t("admin.display.waiting")}
                </h1>
              )}

              {upNext.length > 0 && (
                <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-left">
                  <p className="text-xs font-medium uppercase tracking-[0.25em] text-cyan-400/90">{t("admin.display.upNext")}</p>
                  <ul className="mt-3 space-y-2">
                    {upNext.map((b, i) => (
                      <li key={b.id} className="flex items-baseline gap-3">
                        <span className="font-mono text-sm text-zinc-600">{i + 1}.</span>
                        <span className="font-medium text-white">{b.user.nickname}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">
                          {b.song ? `${b.song.title} — ${b.song.artist}` : b.ytTitle ?? t("admin.display.youtube")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {qrDataUrl && eventInfo && (
                <div className="flex items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                  <img src={qrDataUrl} alt={t("admin.display.qrAlt", { pin: eventInfo.joinCode })} className="h-32 w-32 rounded-lg" />
                  <div className="text-left">
                    <p className="text-sm text-zinc-400">{t("admin.display.scanToJoin")}</p>
                    <p className="font-display mt-1 text-2xl font-semibold tracking-[0.25em] text-white">
                      {eventInfo.joinCode}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{t("admin.display.scanHint")}</p>
                  </div>
                </div>
              )}
            </div>

            <aside className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-left">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-300/90">{t("admin.display.leaderboardTitle")}</p>
              {leaderboard.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">{t("leaderboard.empty")}</p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {leaderboard.slice(0, 8).map((e, i) => (
                    <li key={e.userId} className="flex items-center gap-3">
                      <span className="w-7 shrink-0 text-center text-sm text-zinc-500">{MEDALS[i] ?? i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-white">{e.nickname}</span>
                      <span className="font-display text-lg font-semibold text-amber-300">
                        {e.avgScore.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </div>
        )}

      </main>

      {!live && (
        <footer className="border-t border-zinc-800/80 px-4 py-3 text-center text-xs text-zinc-600 md:px-8">
          <Link to="/join" className="hover:text-zinc-400">
            {t("admin.footer.public")}
          </Link>
          <span className="mx-2 text-zinc-800">|</span>
          <Link to="/admin" className="hover:text-zinc-400">
            {t("common.admin")}
          </Link>
        </footer>
      )}
    </div>
  );
}
