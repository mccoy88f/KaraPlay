import type { Server as IOServer } from "socket.io";

export function setupSocket(io: IOServer): void {
  io.on("connection", (socket) => {
    socket.on("event:join", (payload: { eventId?: string }) => {
      const eventId = typeof payload?.eventId === "string" ? payload.eventId : undefined;
      if (eventId) {
        socket.join(`event:${eventId}`);
        socket.data.eventId = eventId;
      }
    });

    socket.on("display:ready", () => {
      socket.data.isPresenterDisplay = true;
    });

    socket.on("display:transport", (payload: unknown) => {
      if (!socket.data.isPresenterDisplay) return;
      const eventId = socket.data.eventId as string | undefined;
      if (!eventId || !payload || typeof payload !== "object") return;
      const p = payload as { performanceId?: string; sec?: number; playing?: boolean; paused?: boolean };
      if (typeof p.performanceId !== "string" || typeof p.sec !== "number") return;
      socket.to(`event:${eventId}`).emit("display:transport", {
        performanceId: p.performanceId,
        sec: p.sec,
        playing: Boolean(p.playing),
        paused: Boolean(p.paused),
      });
    });

    socket.on("display:sync-request", (payload: unknown) => {
      if (socket.data.isPresenterDisplay) return;
      const eventId = socket.data.eventId as string | undefined;
      if (!eventId || !payload || typeof payload !== "object") return;
      const p = payload as { performanceId?: string };
      if (typeof p.performanceId !== "string") return;
      socket.to(`event:${eventId}`).emit("display:sync-request", { performanceId: p.performanceId });
    });
  });
}
