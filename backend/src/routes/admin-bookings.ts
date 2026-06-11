import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/admin.js";
import { emitQueueUpdate } from "../socket/emit.js";

export async function registerAdminBookingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.put<{ Params: { id: string } }>(
    "/admin/bookings/:id/approve",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (booking.status !== "PENDING") {
        return reply.code(400).send({ error: "Solo prenotazioni PENDING possono essere approvate" });
      }
      if (!booking.ytUrl) {
        return reply.code(400).send({ error: "Approvazione YouTube: manca l'URL" });
      }
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "APPROVED" },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(booking.eventId);
      return reply.send(updated);
    }
  );

  fastify.put<{ Params: { id: string } }>(
    "/admin/bookings/:id/reject",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (booking.status !== "PENDING") {
        return reply.code(400).send({ error: "Solo prenotazioni PENDING possono essere rifiutate" });
      }
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "REJECTED" },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(booking.eventId);
      return reply.send(updated);
    }
  );
}
