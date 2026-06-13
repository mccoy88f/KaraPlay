import { useEffect, useRef, useState } from "react";
import {
  apiGetLivePerformance,
  apiGetVotes,
  apiSendComment,
  apiVote,
  type CommentDto,
} from "../../api/client";
import { getEventSocket } from "../../lib/socket";

type LiveState = {
  performanceId: string;
  title: string;
  artist: string;
  nickname: string;
} | null;

const QUICK_EMOJI = ["🔥", "❤️", "👏", "😂", "🎤", "⭐"];

export function LiveTab({ eventId, userNickname }: { eventId: string; userNickname?: string }) {
  const [live, setLive] = useState<LiveState>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [pendingVote, setPendingVote] = useState(7);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const liveRef = useRef<LiveState>(null);
  liveRef.current = live;

  useEffect(() => {
    let cancelled = false;

    async function loadCurrent() {
      try {
        const { live: now } = await apiGetLivePerformance(eventId);
        if (cancelled) return;
        if (now) {
          setLive({
            performanceId: now.performance.id,
            title: now.song?.title ?? now.booking?.ytTitle ?? "Brano YouTube",
            artist: now.song?.artist ?? "",
            nickname: now.user.nickname,
          });
          const stats = await apiGetVotes(now.performance.id);
          if (cancelled) return;
          setAvg(stats.count > 0 ? stats.avg : null);
          setCount(stats.count);
          setMyVote(stats.myVote ?? null);
        }
      } catch {
        /* lo stato arriva comunque dal socket */
      }
    }
    void loadCurrent();

    const socket = getEventSocket(eventId);

    const onStart = (p: {
      performance: { id: string };
      song: { title: string; artist: string } | null;
      user: { nickname: string };
    }) => {
      setLive({
        performanceId: p.performance.id,
        title: p.song?.title ?? "Brano YouTube",
        artist: p.song?.artist ?? "",
        nickname: p.user.nickname,
      });
      setAvg(null);
      setCount(0);
      setMyVote(null);
      setComments([]);
      setLastScore(null);
      setMsg(null);
      setErr(null);
    };
    const onEnd = (p: { score?: number }) => {
      setLive(null);
      if (typeof p?.score === "number") setLastScore(p.score);
    };
    const onVote = (p: { performanceId: string; avg: number; count: number }) => {
      if (p.performanceId !== liveRef.current?.performanceId) return;
      setAvg(p.count > 0 ? p.avg : null);
      setCount(p.count);
    };
    const onComment = (p: {
      performanceId: string;
      comment: { id: string; text: string; emoji: string | null; createdAt: string };
      user: { nickname: string };
    }) => {
      if (p.performanceId !== liveRef.current?.performanceId) return;
      setComments((prev) => [{ ...p.comment, user: p.user }, ...prev].slice(0, 20));
    };

    socket.on("performance:start", onStart);
    socket.on("performance:end", onEnd);
    socket.on("vote:update", onVote);
    socket.on("comment:new", onComment);
    return () => {
      cancelled = true;
      socket.off("performance:start", onStart);
      socket.off("performance:end", onEnd);
      socket.off("vote:update", onVote);
      socket.off("comment:new", onComment);
    };
  }, [eventId]);

  const isMine = live != null && userNickname != null && live.nickname === userNickname;

  async function sendVote() {
    if (!live) return;
    setErr(null);
    setMsg(null);
    try {
      const stats = await apiVote(live.performanceId, pendingVote);
      setMyVote(pendingVote);
      setAvg(stats.count > 0 ? stats.avg : null);
      setCount(stats.count);
      setMsg(`Voto ${pendingVote} registrato!`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Voto non registrato");
    }
  }

  async function sendComment(emoji?: string) {
    if (!live) return;
    const text = emoji ?? comment.trim();
    if (!text) return;
    setErr(null);
    try {
      await apiSendComment(live.performanceId, text, emoji);
      if (!emoji) setComment("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Commento non inviato");
    }
  }

  if (!live) {
    return (
      <div className="p-5 text-center md:p-6">
        <h2 className="font-display text-lg font-semibold text-white">Nessuna esibizione in corso</h2>
        <p className="mt-3 text-sm text-zinc-400">
          Quando l&apos;host avvia un brano potrai votare e commentare da qui in tempo reale.
        </p>
        {lastScore !== null && (
          <p className="mx-auto mt-5 inline-block rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-5 py-2 text-fuchsia-100">
            Ultimo punteggio: <span className="font-display font-semibold">{lastScore.toFixed(1)}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 md:p-6">
      <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-400/90">In esibizione</p>
      <h2 className="font-display mt-2 text-xl font-semibold text-white">
        {live.nickname} <span className="font-normal text-zinc-500">canta</span>
      </h2>
      <p className="mt-1 text-lg text-zinc-200">
        {live.title}
        {live.artist && <span className="text-zinc-500"> — {live.artist}</span>}
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
        <span className="font-display text-3xl font-semibold text-amber-300">
          {avg != null ? avg.toFixed(1) : "—"}
        </span>
        <span className="text-sm text-zinc-500">
          media live · {count} {count === 1 ? "voto" : "voti"}
        </span>
      </div>

      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      {isMine ? (
        <p className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <span className="font-semibold">È il tuo turno!</span> Sei sul palco — il pubblico sta votando per te. In
          bocca al lupo! 🎤
        </p>
      ) : (
        <div className="mt-5">
          <label className="flex flex-col gap-2 text-sm" htmlFor="vote-slider">
            <span className="text-zinc-400">
              Il tuo voto: <span className="font-display text-lg font-semibold text-white">{pendingVote}</span>
              {myVote != null && <span className="ml-2 text-xs text-zinc-500">(inviato: {myVote})</span>}
            </span>
            <input
              id="vote-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={pendingVote}
              onChange={(e) => setPendingVote(Number(e.target.value))}
              className="accent-fuchsia-500"
            />
          </label>
          <button
            type="button"
            onClick={() => void sendVote()}
            className="mt-3 w-full rounded-xl bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500"
          >
            {myVote != null ? "Aggiorna voto" : "Vota"}
          </button>
        </div>
      )}

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Commenta</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => void sendComment(e)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-lg hover:bg-zinc-800"
            >
              {e}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendComment();
          }}
        >
          <input
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-fuchsia-500/30 focus:ring-2"
            placeholder="Scrivi un commento (max 120)…"
            maxLength={120}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            type="submit"
            disabled={!comment.trim()}
            className="shrink-0 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-40"
          >
            Invia
          </button>
        </form>

        {comments.length > 0 && (
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
                <span className="font-medium text-fuchsia-300">{c.user.nickname}</span>{" "}
                <span className="text-zinc-300">{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
