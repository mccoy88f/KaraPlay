import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { KaraokePlayer } from "../components/KaraokePlayer";
import { apiGetLivePerformance, apiGetQueue, getStoredEvent } from "../api/client";
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
  song: SongPayload | null;
  user: { nickname: string };
};

const socketUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");

export function Display() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("eventId") ?? getStoredEvent()?.id ?? null;

  const [sfBank, setSfBank] = useState<SoundfontBankId>(() => getSoundfontBank(null).id);
  const [queueLen, setQueueLen] = useState<number | null>(null);
  const [live, setLive] = useState<PerfPayload | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ytHint, setYtHint] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const id = eventId;

    let socket: Socket | undefined;

    async function bootstrap() {
      try {
        const q = await apiGetQueue(id);
        setQueueLen(q.queue.length);
        if (q.soundfontBankId) {
          setSfBank(getSoundfontBank(q.soundfontBankId).id);
        }
        const { live: liveNow } = await apiGetLivePerformance(id);
        if (liveNow) {
          setLive({
            performance: liveNow.performance,
            song: liveNow.song,
            user: liveNow.user,
          });
          setLastScore(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore coda");
      }

      socket = io(socketUrl, { path: "/socket.io", transports: ["websocket", "polling"] });
      socket.emit("event:join", { eventId: id });

      socket.on("queue:update", (payload: { queue: unknown[] }) => {
        setQueueLen(payload.queue?.length ?? 0);
      });

      socket.on("performance:start", (payload: PerfPayload) => {
        setLive(payload);
        setLastScore(null);
      });

      socket.on("performance:end", (payload: { score?: number }) => {
        setLive(null);
        if (typeof payload?.score === "number") setLastScore(payload.score);
      });

      socket.on("youtube:processing", (payload: { bookingId: string; progress: number }) => {
        setYtHint(`YouTube: download in corso… ${payload.progress}%`);
      });
      socket.on("youtube:ready", () => {
        setYtHint("Brano YouTube pronto in coda");
        window.setTimeout(() => setYtHint(null), 4000);
      });
      socket.on("youtube:error", (payload: { error?: string }) => {
        setYtHint(`YouTube: errore — ${payload?.error ?? "sconosciuto"}`);
        window.setTimeout(() => setYtHint(null), 8000);
      });
    }

    bootstrap().catch(() => setError("Connessione fallita"));

    return () => {
      socket?.disconnect();
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

  return (
    <div className="kg-page-bg flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 bg-zinc-950/40 px-4 py-4 backdrop-blur-md md:px-8">
        <div>
          <p className="font-display text-[10px] uppercase tracking-[0.45em] text-fuchsia-400/90">Schermo sala</p>
          <p className="mt-1 text-xs text-zinc-500">
            Event <span className="font-mono text-zinc-400">{eventId.slice(0, 8)}…</span>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-left">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Banco GM (admin)</p>
            <p className="font-display text-sm font-medium text-zinc-200">{getSoundfontBank(sfBank).shortLabel}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">In coda</p>
            <p className="font-display text-2xl font-semibold tabular-nums text-cyan-300">
              {queueLen === null ? "—" : queueLen}
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 py-8 text-center md:px-10">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {ytHint && (
          <p className="text-sm text-amber-200/90" role="status">
            {ytHint}
          </p>
        )}

        {live ? (
          <div className="flex flex-1 flex-col items-center gap-6 md:gap-10">
            <p className="font-display text-xl text-zinc-300 md:text-2xl">
              <span className="font-semibold text-white">{live.user.nickname}</span>
              <span className="text-zinc-500"> · </span>
              <span className="text-fuchsia-300/90">in esibizione</span>
            </p>
            {live.song?.source === "MIDI" && live.song.midiPath ? (
              <KaraokePlayer
                key={live.performance.id}
                songId={live.song.id}
                title={live.song.title}
                artist={live.song.artist}
                lrcPath={live.song.lrcPath}
                soundfontBankId={sfBank}
              />
            ) : (
              <div className="flex max-w-4xl flex-col items-center gap-6">
                <h1 className="font-display text-4xl font-bold text-white md:text-6xl">
                  {live.song ? live.song.title : "Brano YouTube"}
                </h1>
                {live.song && <p className="text-xl text-zinc-400">{live.song.artist}</p>}
                {!live.song && (
                  <p className="text-sm text-zinc-500">Testo sincronizzato in arrivo nella prossima fase</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
            <h1 className="font-display max-w-3xl text-4xl font-semibold leading-tight text-white md:text-6xl">
              In attesa del prossimo brano
            </h1>
            <p className="max-w-xl text-lg text-zinc-500">
              La coda si aggiorna in tempo reale. Avvia l&apos;esibizione dall&apos;area admin quando sei pronto.
            </p>
            {lastScore !== null && (
              <p className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-6 py-2 text-fuchsia-100">
                Ultimo punteggio: <span className="font-display font-semibold">{lastScore.toFixed(1)}</span>
              </p>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800/80 px-4 py-3 text-center text-xs text-zinc-600 md:px-8">
        <Link to="/join" className="hover:text-zinc-400">
          Area pubblico
        </Link>
        <span className="mx-2 text-zinc-800">|</span>
        <Link to="/admin" className="hover:text-zinc-400">
          Admin
        </Link>
      </footer>
    </div>
  );
}
