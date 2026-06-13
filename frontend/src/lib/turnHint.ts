import { bookingLabel, sortedActiveQueue, type QueueBookingDto } from "./queueDisplay";

export type TurnHint =
  | { kind: "now"; booking: QueueBookingDto }
  | { kind: "afterPrevious"; booking: QueueBookingDto; previous: QueueBookingDto };

/** Indica se l'utente è sul palco o subito dopo il brano in corso. */
export function turnHintForUser(queue: QueueBookingDto[], userId: string | null | undefined): TurnHint | null {
  if (!userId) return null;
  const active = sortedActiveQueue(queue);
  const mine = active.filter((b) => b.user.id === userId);
  if (mine.length === 0) return null;

  const next = mine[0];
  const idx = active.findIndex((b) => b.id === next.id);
  if (idx < 0) return null;

  if (idx === 0 && next.status === "PERFORMING") {
    return { kind: "now", booking: next };
  }

  if (idx === 1) {
    const previous = active[0];
    if (previous.user.id === userId) return null;
    return { kind: "afterPrevious", booking: next, previous };
  }

  return null;
}

export function turnHintTitle(
  hint: TurnHint,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (hint.kind === "now") return t("turn.nowTitle");
  return t("turn.afterTitle", { title: bookingLabel(hint.previous) });
}

export function turnHintBody(
  hint: TurnHint,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const song = bookingLabel(hint.booking);
  if (hint.kind === "now") return t("turn.nowBody", { song });
  return t("turn.afterBody", { song });
}
