import { prisma } from "./prisma.js";

export async function getQueueForEvent(eventId: string) {
  return prisma.booking.findMany({
    where: { eventId },
    orderBy: { position: "asc" },
    include: {
      user: { select: { id: true, nickname: true } },
      song: true,
      performance: true,
    },
  });
}
