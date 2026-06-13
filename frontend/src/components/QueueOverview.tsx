import { bookingLabel, queuePosition, sortedActiveQueue, statusLabel, type QueueBookingDto } from "../lib/queueDisplay";
import { turnHintForUser } from "../lib/turnHint";
import { useI18n } from "../i18n/context";

type Props = {
  queue: QueueBookingDto[];
  viewerUserId?: string | null;
  loading?: boolean;
};

export function QueueOverview({ queue, viewerUserId, loading }: Props) {
  const { t } = useI18n();
  const pendingMine = queue.filter((b) => b.status === "PENDING" && b.user.id === viewerUserId);
  const active = sortedActiveQueue(queue);
  const turnHint = turnHintForUser(queue, viewerUserId);
  const mineActive = active.filter((b) => b.user.id === viewerUserId);
  const othersActive = active.filter((b) => b.user.id !== viewerUserId);

  const hasAnything = pendingMine.length > 0 || active.length > 0;
  if (!hasAnything && !loading) return null;

  return (
    <section className="mb-6 space-y-4 border-b border-zinc-800 pb-6">
      {loading && !hasAnything && <p className="text-sm text-zinc-500">{t("queue.loading")}</p>}

      {pendingMine.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300/90">
            {t("queue.pendingHost")}
          </h3>
          <ul className="mt-2 space-y-2">
            {pendingMine.map((b) => (
              <li
                key={b.id}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              >
                <p className="font-medium text-white">{bookingLabel(b)}</p>
                <p className="text-xs text-amber-200/70">
                  {statusLabel(b.status, t)}
                  {t("queue.youtubeSuffix")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mineActive.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-fuchsia-300/90">{t("queue.yourQueue")}</h3>
          <ul className="mt-2 space-y-2">
            {mineActive.map((b) => {
              const pos = queuePosition(active, b.id);
              const isYourTurn = turnHint?.kind === "now" && turnHint.booking.id === b.id;
              const isUpNext = turnHint?.kind === "afterPrevious" && turnHint.booking.id === b.id;
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
                      {t("turn.nowTitle")}
                    </p>
                  )}
                  {isUpNext && turnHint.kind === "afterPrevious" && (
                    <p className="mt-1 text-xs text-fuchsia-100/90">
                      {t("queue.afterNamed", { title: bookingLabel(turnHint.previous) })}
                    </p>
                  )}
                  <p className="text-xs text-fuchsia-200/70">{statusLabel(b.status, t)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {othersActive.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            {mineActive.length > 0 ? t("queue.othersQueue") : t("queue.schedule")}
          </h3>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
            {othersActive.map((b) => {
              const pos = queuePosition(active, b.id);
              const marksUpNext = turnHint?.kind === "afterPrevious" && turnHint.previous.id === b.id;
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
                      {b.status === "PERFORMING" && t("queue.onStage")}
                    </p>
                    {marksUpNext && (
                      <p className="mt-1 text-xs font-medium text-amber-200">{t("queue.afterThis")}</p>
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
