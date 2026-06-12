import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { Midi } from "@tonejs/midi";
import { apiGetLivePerformance, apiGetQueue, getStoredEvent } from "../api/client";
import { currentLrcIndex, parseLrc, type LrcLine } from "../lib/lrc";
import { extractMidiLyrics } from "../lib/midiLyrics";

const base = import.meta.env.VITE_API_URL ?? "";
const socketUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");

type LiveState = {
  performanceId: string;
  songId: string | null;
  title: string;
  artist: string;
  nickname: string;
  lrcPath: string | null;
};

type QueueItem = {
  id: string;
  status: string;
  ytTitle?: string | null;
  user: { nickname: string };
  song: { title: string; artist: string } | null;
};

export function Stage() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") ?? getStoredEvent()?.id ?? null;

  const [live, setLive] = useState<LiveState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [timeSec, setTimeSec] = useState(0);
  const [voteAvg, setVoteAvg] = useState<number | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);

  const liveRef = useRef<LiveState | null>(null);
  liveRef.current = live;
  /** Ultimo tick ricevuto dal display: tempo brano + istante locale di ricezione. */
  const tickRef = useRef<{ t: number; at: number } | null>(null);
  const rafRef = useRef(0);

  // Countdown 3-2-1 all'avvio dell'esibizione
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  // Interpolazione del tempo tra un tick e l'altro (i tick arrivano ~3 volte al secondo)
  useEffect(() => {
    if (!live) {
      setTimeSec(0);
      tickRef.current = null;
      return;
    }
    const frame = () => {
      const tick = tickRef.current;
      if (tick) {
        setTimeSec(tick.t + (Date.now() - tick.at) / 1000);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [live]);

  // Testi del brano corrente: file .lrc se presente, altrimenti i lyric incorporati nel MIDI
  useEffect(() => {
    setLrcLines([]);
    if (!live?.songId) return;
    const songId = live.songId;
    let cancelled = false;
    void (async () => {
      try {
        if (live.lrcPath) {
          const res = await fetch(`${base}/api/media/song/${encodeURIComponent(songId)}/lrc`);
          if (res.ok) {
            const text = await res.text();
            if (!cancelled) setLrcLines(parseLrc(text));
            return;
          }
        }
        const midiRes = await fetch(`${base}/api/media/song/${encodeURIComponent(songId)}/midi`);
        if (!midiRes.ok) return;
        const buf = await midiRes.arrayBuffer();
        const lines = extractMidiLyrics(buf, new Midi(buf));
        if (!cancelled) setLrcLines(lines);
      } catch {
        /* senza testi restano titolo e artista */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [live?.songId, live?.lrcPath]);

  useEffect(() => {
    if (!eventId) return;
    const id = eventId;
    let socket: Socket | undefined;
    let cancelled = false;

    function applyLive(payload: {
      performance: { id: string };
      booking?: { ytTitle?: string | null } | null;
      song: { id: string; title: string; artist: string; lrcPath?: string | null } | null;
      user: { nickname: string };
    }) {
      setLive({
        performanceId: payload.performance.id,
        songId: payload.song?.id ?? null,
        title: payload.song?.title ?? payload.booking?.ytTitle ?? "Brano YouTube",
        artist: payload.song?.artist ?? "",
        nickname: payload.user.nickname,
        lrcPath: payload.song?.lrcPath ?? null,
      });
      setVoteAvg(null);
      setLastScore(null);
      tickRef.current = null;
    }

    async function bootstrap() {
      try {
        const q = await apiGetQueue(id);
        if (!cancelled) setQueue((q.queue as QueueItem[]) ?? []);
        const { live: now } = await apiGetLivePerformance(id);
        if (!cancelled && now) applyLive(now);
      } catch {
        /* stato via socket */
      }

      socket = io(socketUrl, { path: "/socket.io", transports: ["websocket", "polling"] });
      socket.emit("event:join", { eventId: id });
      socket.emit("stage:ready");
      socket.on("connect", () => socket?.emit("event:join", { eventId: id }));

      socket.on("performance:start", (payload: Parameters<typeof applyLive>[0]) => {
        applyLive(payload);
        setCountdown(3);
      });

      socket.on("performance:end", (payload: { score?: number }) => {
        setLive(null);
        setCountdown(null);
        if (typeof payload?.score === "number") setLastScore(payload.score);
      });

      socket.on("transport:tick", (payload: { performanceId: string; t: number }) => {
        if (payload.performanceId !== liveRef.current?.performanceId) return;
        tickRef.current = { t: payload.t, at: Date.now() };
      });

      socket.on("vote:update", (payload: { performanceId: string; avg: number; count: number }) => {
        if (payload.performanceId !== liveRef.current?.performanceId) return;
        setVoteAvg(payload.count > 0 ? payload.avg : null);
      });

      socket.on("queue:update", (payload: { queue: QueueItem[] }) => {
        setQueue(payload.queue ?? []);
      });
    }

    bootstrap().catch(() => {});
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [eventId]);

  const idx = useMemo(() => currentLrcIndex(lrcLines, timeSec), [lrcLines, timeSec]);
  const idxShow = idx < 0 ? 0 : idx;
  const upNext = queue.filter((b) => b.status === "APPROVED" || b.status === "READY").slice(0, 2);

  if (!eventId) {
    return (
      <div className="kg-page-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xs uppercase tracking-[0.4em] text-cyan-400/90">Palco</p>
        <h1 className="font-display mt-6 text-3xl font-semibold text-white">Serata non selezionata</h1>
        <p className="mt-4 max-w-lg text-zinc-400">
          Apri questa pagina dopo un join oppure aggiungi{" "}
          <code className="rounded-lg bg-zinc-800 px-2 py-0.5 font-mono text-cyan-300">?eventId=…</code> all&apos;URL.
        </p>
        <Link to="/join" className="mt-8 text-sm text-cyan-400 hover:underline">
          Torna al pubblico
        </Link>
      </div>
    );
  }

  return (
    <div className="kg-page-bg flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        {live ? (
          countdown != null && countdown > 0 ? (
            <div>
              <p className="font-display text-2xl text-zinc-400">
                {live.nickname}, tocca a te!
              </p>
              <p className="font-display mt-6 text-[10rem] font-bold leading-none text-cyan-300 drop-shadow-[0_0_60px_rgba(34,211,238,0.4)]">
                {countdown}
              </p>
              <p className="mt-6 text-xl text-zinc-300">
                {live.title}
                {live.artist && <span className="text-zinc-500"> — {live.artist}</span>}
              </p>
            </div>
          ) : (
            <div className="flex w-full max-w-6xl flex-col items-center gap-10">
              <div className="flex w-full flex-wrap items-center justify-between gap-4">
                <p className="font-display text-lg text-zinc-400">
                  🎤 <span className="text-white">{live.nickname}</span> · {live.title}
                  {live.artist && <span className="text-zinc-600"> — {live.artist}</span>}
                </p>
                <p className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-amber-200">
                  ★ <span className="font-display font-semibold">{voteAvg != null ? voteAvg.toFixed(1) : "—"}</span>
                </p>
              </div>

              {lrcLines.length > 0 ? (
                <div className="w-full space-y-8 text-left">
                  {lrcLines[idxShow - 1] && (
                    <p className="text-3xl text-zinc-600 md:text-4xl">{lrcLines[idxShow - 1].text}</p>
                  )}
                  <p className="text-5xl font-semibold leading-tight text-cyan-100 drop-shadow-[0_0_30px_rgba(34,211,238,0.3)] md:text-7xl">
                    {lrcLines[idxShow]?.text ?? "…"}
                  </p>
                  {lrcLines[idxShow + 1] && (
                    <p className="text-3xl text-zinc-500 md:text-4xl">{lrcLines[idxShow + 1].text}</p>
                  )}
                </div>
              ) : (
                <div>
                  <h1 className="font-display text-5xl font-bold text-white md:text-7xl">{live.title}</h1>
                  {live.artist && <p className="mt-4 text-2xl text-zinc-400">{live.artist}</p>}
                  <p className="mt-8 text-lg text-zinc-500">
                    Nessun testo sincronizzato per questo brano: Free Style! 🎶
                  </p>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-8">
            <p className="font-display text-xs uppercase tracking-[0.4em] text-cyan-400/90">Palco</p>
            {lastScore !== null && (
              <p className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-6 py-2 text-xl text-fuchsia-100">
                Punteggio: <span className="font-display font-semibold">{lastScore.toFixed(1)}</span>
              </p>
            )}
            <h1 className="font-display max-w-2xl text-4xl font-semibold text-white md:text-5xl">
              {upNext.length > 0 ? "Preparati, si comincia tra poco" : "In attesa della prossima esibizione"}
            </h1>
            {upNext.length > 0 && (
              <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-left">
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-cyan-400/90">Prossimi sul palco</p>
                <ul className="mt-4 space-y-3">
                  {upNext.map((b, i) => (
                    <li key={b.id} className="flex items-baseline gap-3">
                      <span className="font-mono text-zinc-600">{i + 1}.</span>
                      <span className="font-display text-xl font-medium text-white">{b.user.nickname}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-400">
                        {b.song ? `${b.song.title} — ${b.song.artist}` : b.ytTitle ?? "YouTube"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800/80 py-4 text-center text-sm text-zinc-500">
        <Link to="/join" className="hover:text-white">
          Pubblico
        </Link>
        <span className="mx-3 text-zinc-800">·</span>
        <Link to="/display" className="hover:text-white">
          Display
        </Link>
      </footer>
    </div>
  );
}
