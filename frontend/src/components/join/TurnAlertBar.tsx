import { useCallback, useEffect, useRef, useState } from "react";
import { apiGetQueue, getStoredUserId } from "../../api/client";
import { getEventSocket } from "../../lib/socket";
import type { QueueBookingDto } from "../../lib/queueDisplay";
import { turnHintBody, turnHintForUser, turnHintTitle, type TurnHint } from "../../lib/turnHint";

type Props = {
  eventId: string;
};

function notifyBrowser(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "karaplay-turn" });
  } catch {
    /* permesso revocato o contesto non valido */
  }
}

/** Banner turno visibile su tutti i tab di /join. */
export function TurnAlertBar({ eventId }: Props) {
  const userId = getStoredUserId();
  const [hint, setHint] = useState<TurnHint | null>(null);
  const lastNotifiedRef = useRef<string | null>(null);

  const applyQueue = useCallback(
    (queue: QueueBookingDto[]) => {
      const next = turnHintForUser(queue, userId);
      setHint(next);

      if (!next) return;
      const key = next.kind === "now" ? `now:${next.booking.id}` : `after:${next.booking.id}:${next.previous.id}`;
      if (lastNotifiedRef.current === key) return;
      lastNotifiedRef.current = key;
      notifyBrowser(turnHintTitle(next), turnHintBody(next));
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void apiGetQueue(eventId)
      .then((data) => {
        if (!cancelled) applyQueue(data.queue ?? []);
      })
      .catch(() => {});

    const socket = getEventSocket(eventId);
    const onQueue = (payload: { queue?: QueueBookingDto[] }) => {
      applyQueue(payload.queue ?? []);
    };
    const onStart = (payload: { user?: { id?: string } }) => {
      if (payload.user?.id === userId) {
        lastNotifiedRef.current = `now:live:${Date.now()}`;
        notifyBrowser("È il tuo turno!", "Vai sul palco — in bocca al lupo! 🎤");
      }
    };

    socket.on("queue:update", onQueue);
    socket.on("performance:start", onStart);
    return () => {
      cancelled = true;
      socket.off("queue:update", onQueue);
      socket.off("performance:start", onStart);
    };
  }, [eventId, userId, applyQueue]);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission();
  }, []);

  if (!hint) return null;

  const isNow = hint.kind === "now";

  return (
    <div
      role="status"
      className={
        isNow
          ? "rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm text-amber-50 shadow-lg shadow-amber-950/30"
          : "rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-50"
      }
    >
      <p className="font-display text-base font-semibold">{turnHintTitle(hint)}</p>
      <p className="mt-1 text-sm opacity-90">{turnHintBody(hint)}</p>
    </div>
  );
}
