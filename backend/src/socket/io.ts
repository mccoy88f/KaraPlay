import type { Server as IOServer } from "socket.io";

let ioRef: IOServer | null = null;

export function setIo(io: IOServer): void {
  ioRef = io;
}

export function getIo(): IOServer | null {
  return ioRef;
}
