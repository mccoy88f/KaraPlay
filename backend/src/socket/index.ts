import type { Server as IOServer } from "socket.io";

export function setupSocket(io: IOServer): void {
  io.on("connection", (socket) => {
    socket.on("event:join", (payload: { eventId?: string }) => {
      const eventId = typeof payload?.eventId === "string" ? payload.eventId : undefined;
      if (eventId) {
        socket.join(`event:${eventId}`);
      }
    });

    socket.on("display:ready", () => {
      socket.data.displayReady = true;
    });

    socket.on("stage:ready", () => {
      socket.data.stageReady = true;
    });
  });
}
