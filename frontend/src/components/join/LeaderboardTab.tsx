import { useEffect, useState } from "react";
import {
  apiGetEventLeaderboard,
  apiGetGlobalLeaderboard,
  type LeaderboardEntry,
} from "../../api/client";
import { getEventSocket } from "../../lib/socket";

const MEDALS = ["🥇", "🥈", "🥉"];

function LeaderboardList({ entries, highlightNickname }: { entries: LeaderboardEntry[]; highlightNickname?: string }) {
  if (entries.length === 0) {
    return <p className="mt-4 text-center text-sm text-zinc-500">Ancora nessuna esibizione conclusa.</p>;
  }
  return (
    <ol className="mt-4 space-y-2">
      {entries.map((e, i) => {
        const mine = highlightNickname != null && e.nickname === highlightNickname;
        return (
          <li
            key={e.userId}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
              mine
                ? "border-fuchsia-500/50 bg-fuchsia-500/10"
                : "border-zinc-800 bg-zinc-950/60"
            }`}
          >
            <span className="w-8 shrink-0 text-center font-mono text-sm text-zinc-500">
              {MEDALS[i] ?? i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-white">{e.nickname}</span>
            <span className="text-xs text-zinc-600">
              {e.performances} {e.performances === 1 ? "brano" : "brani"}
            </span>
            <span className="font-display w-12 text-right text-lg font-semibold text-amber-300">
              {e.avgScore.toFixed(1)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LeaderboardTab({ eventId, userNickname }: { eventId: string; userNickname?: string }) {
  const [scope, setScope] = useState<"event" | "global">("event");
  const [eventEntries, setEventEntries] = useState<LeaderboardEntry[]>([]);
  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [ev, gl] = await Promise.all([apiGetEventLeaderboard(eventId), apiGetGlobalLeaderboard()]);
        if (cancelled) return;
        setEventEntries(ev.entries);
        setGlobalEntries(gl.entries);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Errore classifica");
      }
    })();

    const socket = getEventSocket(eventId);
    const onUpdate = (p: { entries: LeaderboardEntry[] }) => {
      setEventEntries(p.entries ?? []);
    };
    socket.on("leaderboard:update", onUpdate);
    return () => {
      cancelled = true;
      socket.off("leaderboard:update", onUpdate);
    };
  }, [eventId]);

  return (
    <div className="p-5 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-white">Classifica</h2>
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1 text-xs">
          <button
            type="button"
            onClick={() => setScope("event")}
            className={scope === "event" ? "rounded bg-zinc-700 px-3 py-1 text-white" : "px-3 py-1 text-zinc-500"}
          >
            Serata
          </button>
          <button
            type="button"
            onClick={() => setScope("global")}
            className={scope === "global" ? "rounded bg-zinc-700 px-3 py-1 text-white" : "px-3 py-1 text-zinc-500"}
          >
            Storica
          </button>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      <LeaderboardList
        entries={scope === "event" ? eventEntries : globalEntries}
        highlightNickname={userNickname}
      />
      <p className="mt-4 text-xs text-zinc-600">
        Punteggio = media voti (80%) + bonus commenti ricevuti (20%). Si aggiorna a fine esibizione.
      </p>
    </div>
  );
}
