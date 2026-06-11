import { getIo } from "./io.js";
import { getQueueForEvent } from "../lib/queue.js";

export async function emitQueueUpdate(eventId: string): Promise<void> {
  const queue = await getQueueForEvent(eventId);
  getIo()?.to(`event:${eventId}`).emit("queue:update", { queue });
}
