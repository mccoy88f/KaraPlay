import { bookingLabel, queuePosition, sortedActiveQueue, statusLabel, type QueueBookingDto } from "../lib/queueDisplay";
import { turnHintForUser } from "../lib/turnHint";

type Props = {
  queue: QueueBookingDto[];
  viewerUserId?: string | null;
  loading?: boolean;
};

export function QueueOverview({ queue, viewerUserId, loading }: Props) {
  const pendingMine = queue.filter((b) => b.status === "PENDING" && b.user.id === viewerUserId);
  const active = sortedActiveQueue(queue);
  const turnHint = turnHintForUser(queue, viewerUserId);
  const mineActive = active.filter((b) => b.user.id === viewerUserId);
  const othersActive = active.filter((b) => b.user.id !== viewerUserId);

  const hasAnything = pendingMine.length > 0 || active.length > 0;
  if (!hasAnything && !loading) return null;

  return (
    <section className="mb-6 space-y-4 border-b border-zinc-800 pb-6">
      {loading && !hasAnything && <p className="text-sm text-zinc-500">Carico la scaletta…</p>}

      {pendingMine.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300/90">
            In attesa di ok dall&apos;host
          </h3>
          <ul className="mt-2 space-y-2">
            {pendingMine.map((b) => (
              <li
                key={b.id}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              >
                <p className="font-medium text-white">{bookingLabel(b)}</p>
                <p className="text-xs text-amber-200/70">{statusLabel(b.status)} · video YouTube</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mineActive.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-fuchsia-300/90">La tua coda</h3>
          <ul className="mt-2 space-y-2">
            {mineActive.map((b) => {
              const pos = queuePosition(active, b.id);
              const isYourTurn = turnHint?.kind === "now" && turnHint.booking.id === b.id;
              const isUpNext =
                turnHint?.kind === "afterPrevious" && turnHint.booking.id === b.id;
              return (
                <li
                  key={b.id}
                  className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-white">
                    {pos != null && (
                      <span className="mr-2 font-display text-fuchsia-300">#{pos}</span>
                    )}
                    {bookingLabel(b)}
                  </p>
                  {isYourTurn && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                      È il tuo turno!
                    </p>
                  )}
                  {isUpNext && turnHint.kind === "afterPrevious" && (
                    <p className="mt-1 text-xs text-fuchsia-100/90">
                      Dopo «{bookingLabel(turnHint.previous)}» tocca a te
                    </p>
                  )}
                  <p className="text-xs text-fuchsia-200/70">{statusLabel(b.status)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {othersActive.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            {mineActive.length > 0 ? "Altri in scaletta" : "Scaletta"}
          </h3>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
            {othersActive.map((b) => {
              const pos = queuePosition(active, b.id);
              const marksUpNext =
                turnHint?.kind === "afterPrevious" && turnHint.previous.id === b.id;
              return (
                <li
                  key={b.id}
                  className={`flex items-baseline gap-2 rounded-lg border px-3 py-2 text-sm ${
                    marksUpNext
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-zinc-800 bg-zinc-950/60"
                  }`}
                >
                  <span className="shrink-0 font-display tabular-nums text-zinc-500">#{pos}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-zinc-200">{bookingLabel(b)}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {b.user.nickname}
                      {b.status === "PERFORMING" && " · sul palco"}
                    </p>
                    {marksUpNext && (
                      <p className="mt-1 text-xs font-medium text-amber-200">Dopo questa tocca a te</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
