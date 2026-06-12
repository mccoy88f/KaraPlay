import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import { KaraokePlayer } from "../components/KaraokePlayer";
import { YoutubeEmbed } from "../components/YoutubeEmbed";
import { YoutubeVideo } from "../components/YoutubeVideo";
import {
  apiGetEventById,
  apiGetEventLeaderboard,
  apiGetLivePerformance,
  apiGetQueue,
  apiGetVotes,
  getStoredEvent,
  type LeaderboardEntry,
} from "../api/client";
import type { SoundfontBankId } from "../lib/soundfontBanks";
import { getSoundfontBank } from "../lib/soundfontBanks";

type SongPayload = {
  id: string;
  title: string;
  artist: string;
  source?: string;
  midiPath?: string | null;
  lrcPath?: string | null;
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

const socketUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");
const MEDALS = ["🥇", "🥈", "🥉"];
const COMMENT_TTL_MS = 9000;

export function Display() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") ?? getStoredEvent()?.id ?? null;

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

  // Scadenza commenti overlay
  useEffect(() => {
    if (comments.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setComments((prev) => prev.filter((c) => c.expiresAt > now));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [comments.length]);

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
        if (!cancelled) setError(e instanceof Error ? e.message : "Serata non trovata");
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
        if (!cancelled) setError(e instanceof Error ? e.message : "Errore coda");
      }

      socket = io(socketUrl, { path: "/socket.io", transports: ["websocket", "polling"] });
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
        if (typeof payload?.score === "number") setLastScore(payload.score);
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

      socket.on("youtube:processing", (payload: { progress: number }) => {
        setYtHint(`Download video in corso… ${payload.progress}%`);
      });
      socket.on("youtube:ready", () => {
        setYtHint("Video pronto: si avvia senza pubblicità");
        window.setTimeout(() => setYtHint(null), 5000);
      });
      socket.on("youtube:error", (payload: { error?: string }) => {
        setYtHint(`Download video fallito (si userà l'embed) — ${payload?.error ?? "errore"}`);
        window.setTimeout(() => setYtHint(null), 8000);
      });
    }

    bootstrap().catch(() => setError("Connessione fallita"));

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [eventId]);

  if (!eventId) {
    return (
      <div className="kg-page-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xs uppercase tracking-[0.4em] text-amber-300/90">Display</p>
        <h1 className="font-display mt-6 text-3xl font-semibold text-white">Serata non selezionata</h1>
        <p className="mt-4 max-w-lg text-zinc-400">
          Apri questa pagina dopo un join dal telefono oppure aggiungi{" "}
          <code className="rounded-lg bg-zinc-800 px-2 py-0.5 font-mono text-fuchsia-300">?eventId=…</code>{" "}
          all&apos;URL.
        </p>
        <Link to="/join" className="mt-8 text-sm text-fuchsia-400 hover:underline">
          Torna al pubblico
        </Link>
      </div>
    );
  }

  const upNext = queue.filter((b) => b.status === "APPROVED" || b.status === "READY").slice(0, 3);
  const queueLen = queue.filter((b) => !["DONE", "REJECTED", "SKIPPED"].includes(b.status)).length;

  return (
    <div className="kg-page-bg flex h-dvh flex-col overflow-hidden">
      {/* l'header (PIN, banco, coda) serve in attesa: durante l'esibizione tutto lo schermo è palco */}
      {!live && (
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 bg-zinc-950/40 px-4 py-4 backdrop-blur-md md:px-8">
        <div>
          <p className="font-display text-[10px] uppercase tracking-[0.45em] text-fuchsia-400/90">Schermo sala</p>
          <p className="font-display mt-1 text-sm font-medium text-zinc-200">
            {eventInfo ? eventInfo.name : `Event ${eventId.slice(0, 8)}…`}
            {eventInfo?.location && <span className="text-zinc-500"> · {eventInfo.location}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {eventInfo && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-left">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">PIN serata</p>
              <p className="font-display text-2xl font-semibold tracking-[0.2em] text-fuchsia-300">
                {eventInfo.joinCode}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-left">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Banco GM (admin)</p>
            <p className="font-display text-sm font-medium text-zinc-200">{getSoundfontBank(sfBank).shortLabel}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">In coda</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-cyan-300">{queueLen}</p>
          </div>
        </div>
      </header>
      )}

      <main className={`relative flex min-h-0 flex-1 flex-col px-4 text-center md:px-10 ${live ? "py-4" : "overflow-y-auto py-8"}`}>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {ytHint && (
          <p className="text-sm text-amber-200/90" role="status">
            {ytHint}
          </p>
        )}

        {live ? (
          <div className="flex min-h-0 flex-1 flex-col items-center gap-4 md:gap-5">
            {/* unica riga in alto durante l'esibizione: nome, voti e titolo; il resto è palco */}
            <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <p className="font-display text-xl text-zinc-300 md:text-2xl">
                <span className="font-semibold text-white">{live.user.nickname}</span>
                <span className="text-zinc-500"> · </span>
                <span className="text-fuchsia-300/90">in esibizione</span>
              </p>
              <p className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-amber-200">
                ★ <span className="font-display text-lg font-semibold">{voteAvg != null ? voteAvg.toFixed(1) : "—"}</span>
                <span className="ml-2 text-xs text-amber-200/70">
                  ({voteCount} {voteCount === 1 ? "voto" : "voti"})
                </span>
              </p>
              {live.song?.source !== "MIDI" && (
                <p className="max-w-xl truncate text-sm text-zinc-500">
                  {live.booking?.ytTitle ?? live.song?.title ?? ""}
                </p>
              )}
            </div>
            {live.song?.source === "MIDI" && live.song.midiPath ? (
              <KaraokePlayer
                key={live.performance.id}
                songId={live.song.id}
                title={live.song.title}
                artist={live.song.artist}
                lrcPath={live.song.lrcPath}
                soundfontBankId={sfBank}
              />
            ) : live.song?.source === "YOUTUBE" && live.booking?.id ? (
              // Video pre-scaricato sul server (la Song esiste solo a download completato): no pubblicità.
              <YoutubeVideo
                key={live.performance.id}
                bookingId={live.booking.id}
                title={live.song.title}
              />
            ) : live.booking?.ytUrl ? (
              <YoutubeEmbed
                key={live.performance.id}
                ytUrl={live.booking.ytUrl}
                title={live.booking.ytTitle ?? live.song?.title ?? "Brano YouTube"}
              />
            ) : (
              <div className="flex max-w-4xl flex-col items-center gap-6">
                <h1 className="font-display text-4xl font-bold text-white md:text-6xl">
                  {live.song ? live.song.title : "Brano"}
                </h1>
                {live.song && <p className="text-xl text-zinc-400">{live.song.artist}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="grid flex-1 gap-8 py-8 lg:grid-cols-[1fr_minmax(280px,360px)]">
            <div className="flex flex-col items-center justify-center gap-6">
              {lastScore !== null ? (
                <>
                  <p className="font-display text-xl uppercase tracking-[0.3em] text-fuchsia-300/90">Punteggio</p>
                  <p className="font-display text-8xl font-bold text-white drop-shadow-[0_0_40px_rgba(232,121,249,0.35)]">
                    {lastScore.toFixed(1)}
                  </p>
                </>
              ) : (
                <h1 className="font-display max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
                  In attesa del prossimo brano
                </h1>
              )}

              {upNext.length > 0 && (
                <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-left">
                  <p className="text-xs font-medium uppercase tracking-[0.25em] text-cyan-400/90">Prossimi</p>
                  <ul className="mt-3 space-y-2">
                    {upNext.map((b, i) => (
                      <li key={b.id} className="flex items-baseline gap-3">
                        <span className="font-mono text-sm text-zinc-600">{i + 1}.</span>
                        <span className="font-medium text-white">{b.user.nickname}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">
                          {b.song ? `${b.song.title} — ${b.song.artist}` : b.ytTitle ?? "YouTube"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {qrDataUrl && eventInfo && (
                <div className="flex items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                  <img src={qrDataUrl} alt={`QR per entrare nella serata, PIN ${eventInfo.joinCode}`} className="h-32 w-32 rounded-lg" />
                  <div className="text-left">
                    <p className="text-sm text-zinc-400">Inquadra per partecipare</p>
                    <p className="font-display mt-1 text-2xl font-semibold tracking-[0.25em] text-white">
                      {eventInfo.joinCode}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">prenota · vota · commenta</p>
                  </div>
                </div>
              )}
            </div>

            <aside className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-left">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-300/90">🏆 Classifica serata</p>
              {leaderboard.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">Ancora nessuna esibizione conclusa.</p>
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

        {comments.length > 0 && (
          <div className="pointer-events-none absolute bottom-4 left-4 flex max-w-md flex-col gap-2 text-left">
            {comments.map((c) => (
              <p
                key={c.id}
                className="rounded-xl border border-zinc-700/80 bg-zinc-950/85 px-4 py-2 text-sm shadow-lg backdrop-blur"
              >
                💬 <span className="font-semibold text-fuchsia-300">{c.nickname}</span>{" "}
                <span className="text-zinc-200">{c.text}</span>
              </p>
            ))}
          </div>
        )}
      </main>

      {!live && (
        <footer className="border-t border-zinc-800/80 px-4 py-3 text-center text-xs text-zinc-600 md:px-8">
          <Link to="/join" className="hover:text-zinc-400">
            Area pubblico
          </Link>
          <span className="mx-2 text-zinc-800">|</span>
          <Link to="/admin" className="hover:text-zinc-400">
            Admin
          </Link>
        </footer>
      )}
    </div>
  );
}
