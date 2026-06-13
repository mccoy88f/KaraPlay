export type QueueBookingDto = {
  id: string;
  status: string;
  position: number;
  ytUrl?: string | null;
  ytTitle?: string | null;
  user: { id: string; nickname: string };
  song: { title: string; artist: string; source?: string } | null;
};

export const ACTIVE_QUEUE_STATUSES = ["APPROVED", "READY", "PROCESSING", "PERFORMING"] as const;

export function bookingLabel(b: QueueBookingDto): string {
  if (b.song) return `${b.song.title} — ${b.song.artist}`;
  return b.ytTitle ?? b.ytUrl ?? "Brano";
}

export function sortedActiveQueue(queue: QueueBookingDto[]): QueueBookingDto[] {
  return queue
    .filter((b) => (ACTIVE_QUEUE_STATUSES as readonly string[]).includes(b.status))
    .sort((a, b) => a.position - b.position);
}

export function queuePosition(active: QueueBookingDto[], bookingId: string): number | null {
  const idx = active.findIndex((b) => b.id === bookingId);
  return idx >= 0 ? idx + 1 : null;
}

export function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "PENDING":
      return t("queue.status.pending");
    case "APPROVED":
      return t("queue.status.approved");
    case "READY":
      return t("queue.status.ready");
    case "PROCESSING":
      return t("queue.status.processing");
    case "PERFORMING":
      return t("queue.status.performing");
    default:
      return status;
  }
}
