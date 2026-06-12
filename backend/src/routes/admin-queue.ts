import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canManageEvent, requireAdmin } from "../middleware/admin.js";
import type { JwtPayload } from "../types/jwt.js";
import { getIo } from "../socket/io.js";
import { emitQueueUpdate } from "../socket/emit.js";

const moveSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export async function registerAdminQueueRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>(
    "/admin/bookings/:id/move",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = moveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Body non valido", details: parsed.error.flatten() });
      }
      const { direction } = parsed.data;
      const booking = await prisma.booking.findUnique({
        where: { id: request.params.id },
        select: { id: true, eventId: true, position: true },
      });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }

      const list = await prisma.booking.findMany({
        where: { eventId: booking.eventId },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const idx = list.findIndex((b) => b.id === booking.id);
      if (idx < 0) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= list.length) {
        return reply.code(400).send({ error: "Impossibile spostare in questa direzione" });
      }

      const a = list[idx]!;
      const b = list[swapWith]!;
      await prisma.$transaction([
        prisma.booking.update({ where: { id: a.id }, data: { position: b.position } }),
        prisma.booking.update({ where: { id: b.id }, data: { position: a.position } }),
      ]);

      await emitQueueUpdate(booking.eventId);
      return reply.send({ ok: true });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/admin/bookings/:id",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({
        where: { id: request.params.id },
        include: { performance: true },
      });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }

      const eventId = booking.eventId;
      const perf = booking.performance;

      if (perf) {
        await prisma.vote.deleteMany({ where: { performanceId: perf.id } });
        await prisma.comment.deleteMany({ where: { performanceId: perf.id } });
        if (!perf.endedAt) {
          getIo()?.to(`event:${eventId}`).emit("performance:end", {
            performance: perf,
            score: undefined,
            cancelled: true,
          });
        }
        await prisma.performance.delete({ where: { id: perf.id } });
      }

      await prisma.booking.delete({ where: { id: booking.id } });
      await emitQueueUpdate(eventId);
      return reply.send({ ok: true });
    }
  );
}
