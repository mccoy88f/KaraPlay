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

const reorderSchema = z.object({
  bookingIds: z.array(z.string().min(1)).min(1),
});

const REORDERABLE_STATUSES = new Set(["APPROVED", "READY", "PROCESSING"]);

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
        select: { id: true, position: true, status: true },
      });
      const reorderable = list.filter((b) => REORDERABLE_STATUSES.has(b.status));
      const idx = reorderable.findIndex((b) => b.id === booking.id);
      if (idx < 0) {
        return reply.code(400).send({ error: "Prenotazione non spostabile" });
      }
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= reorderable.length) {
        return reply.code(400).send({ error: "Impossibile spostare in questa direzione" });
      }

      const a = reorderable[idx]!;
      const b = reorderable[swapWith]!;
      await prisma.$transaction([
        prisma.booking.update({ where: { id: a.id }, data: { position: b.position } }),
        prisma.booking.update({ where: { id: b.id }, data: { position: a.position } }),
      ]);

      await emitQueueUpdate(booking.eventId);
      return reply.send({ ok: true });
    }
  );

  fastify.put<{ Params: { eventId: string } }>(
    "/admin/events/:eventId/queue/reorder",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = reorderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Body non valido", details: parsed.error.flatten() });
      }
      const { eventId } = request.params;
      if (!(await canManageEvent(request.user as JwtPayload, eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }

      const all = await prisma.booking.findMany({
        where: { eventId },
        orderBy: { position: "asc" },
        select: { id: true, status: true },
      });

      const reorderable = all.filter((b) => REORDERABLE_STATUSES.has(b.status));
      const { bookingIds } = parsed.data;

      if (bookingIds.length !== reorderable.length) {
        return reply.code(400).send({ error: "Lista prenotazioni incompleta o non valida" });
      }

      const reorderableIds = new Set(reorderable.map((b) => b.id));
      if (!bookingIds.every((id) => reorderableIds.has(id))) {
        return reply.code(400).send({ error: "Una o più prenotazioni non sono in scaletta" });
      }

      let nextIdx = 0;
      const orderedIds = all.map((b) => {
        if (REORDERABLE_STATUSES.has(b.status)) {
          return bookingIds[nextIdx++]!;
        }
        return b.id;
      });

      await prisma.$transaction(
        orderedIds.map((id, idx) =>
          prisma.booking.update({ where: { id }, data: { position: idx + 1 } })
        )
      );

      await emitQueueUpdate(eventId);
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
