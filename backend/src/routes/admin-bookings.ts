import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canManageEvent, requireAdmin } from "../middleware/admin.js";
import type { JwtPayload } from "../types/jwt.js";
import { emitQueueUpdate } from "../socket/emit.js";

export async function registerAdminBookingRoutes(fastify: FastifyInstance): Promise<void> {
  /** Bis: duplica una prenotazione già conclusa in fondo alla scaletta. */
  fastify.post<{ Params: { id: string } }>(
    "/admin/bookings/:id/replay",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (booking.status !== "DONE" && booking.status !== "SKIPPED") {
        return reply.code(400).send({ error: "Si può ripetere solo un brano già concluso" });
      }
      const last = await prisma.booking.findFirst({
        where: { eventId: booking.eventId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await prisma.booking.create({
        data: {
          eventId: booking.eventId,
          userId: booking.userId,
          songId: booking.songId,
          ytUrl: booking.ytUrl,
          ytTitle: booking.ytTitle,
          position: (last?.position ?? 0) + 1,
          // video YouTube già scaricato (Song presente): riparte subito senza pubblicità
          status: booking.songId && booking.ytUrl ? "READY" : "APPROVED",
        },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(booking.eventId);
      return reply.code(201).send(created);
    }
  );

  fastify.put<{ Params: { id: string } }>(
    "/admin/bookings/:id/approve",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
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
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
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
