import { io, type Socket } from "socket.io-client";

const url =
  import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");

let socket: Socket | null = null;
let joinedEventId: string | null = null;

/**
 * Socket condiviso tra i tab di /join (un'unica connessione per pagina).
 * Rientra nella room della serata anche dopo una riconnessione.
 */
export function getEventSocket(eventId: string): Socket {
  if (!socket) {
    socket = io(url, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      if (joinedEventId) socket?.emit("event:join", { eventId: joinedEventId });
    });
  }
  if (joinedEventId !== eventId) {
    joinedEventId = eventId;
    socket.emit("event:join", { eventId });
  }
  return socket;
}
