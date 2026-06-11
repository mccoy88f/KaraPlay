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
      socket.data.displayReady = true;
    });

    socket.on("stage:ready", () => {
      socket.data.stageReady = true;
    });

    /**
     * Il display è l'orologio dell'esibizione: rilancia il tempo di trasporto alla room
     * così /stage (e /join) possono sincronizzare i testi senza un clock condiviso.
     */
    socket.on(
      "transport:tick",
      (payload: { eventId?: string; performanceId?: string; t?: number }) => {
        const eventId = typeof payload?.eventId === "string" ? payload.eventId : undefined;
        if (!eventId || eventId !== socket.data.eventId) return;
        if (typeof payload.t !== "number" || typeof payload.performanceId !== "string") return;
        socket.to(`event:${eventId}`).emit("transport:tick", {
          performanceId: payload.performanceId,
          t: payload.t,
        });
      }
    );
  });
}
