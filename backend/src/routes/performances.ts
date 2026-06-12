import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canManageEvent, requireAdmin } from "../middleware/admin.js";
import type { JwtPayload } from "../types/jwt.js";
import { getIo } from "../socket/io.js";
import { emitQueueUpdate } from "../socket/emit.js";
import { getEventLeaderboard, recordPerformanceScore } from "../services/leaderboard.service.js";

export async function registerPerformanceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { id: string } }>("/performances/:id", async (request, reply) => {
    const perf = await prisma.performance.findUnique({
      where: { id: request.params.id },
      include: {
        booking: { include: { song: true } },
        user: { select: { id: true, nickname: true } },
      },
    });
    if (!perf) {
      return reply.code(404).send({ error: "Esibizione non trovata" });
    }
    return reply.send(perf);
  });

  fastify.post<{ Params: { bookingId: string } }>(
    "/admin/performances/start/:bookingId",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { bookingId } = request.params;
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { song: true, user: { select: { id: true, nickname: true } }, event: true },
      });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (booking.status !== "APPROVED" && booking.status !== "READY") {
        return reply
          .code(400)
          .send({ error: "La prenotazione non è pronta per l'avvio (stato non valido)" });
      }

      const performing = await prisma.booking.findFirst({
        where: { eventId: booking.eventId, status: "PERFORMING" },
      });
      if (performing) {
        return reply.code(409).send({ error: "È già in corso un'altra esibizione" });
      }

      const performance = await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: "PERFORMING" },
        });
        return tx.performance.create({
          data: {
            eventId: booking.eventId,
            bookingId: booking.id,
            userId: booking.userId,
            startedAt: new Date(),
          },
          include: {
            booking: { include: { song: true } },
            user: { select: { id: true, nickname: true } },
          },
        });
      });

      const payload = {
        performance,
        song: booking.song,
        booking: { ...booking, status: "PERFORMING" as const },
        user: booking.user,
      };

      getIo()?.to(`event:${booking.eventId}`).emit("performance:start", payload);
      await emitQueueUpdate(booking.eventId);

      return reply.code(201).send(performance);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/admin/performances/:id/end",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const perf = await prisma.performance.findUnique({
        where: { id: request.params.id },
        include: { booking: true },
      });
      if (!perf) {
        return reply.code(404).send({ error: "Esibizione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, perf.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (perf.endedAt) {
        return reply.code(400).send({ error: "Esibizione già terminata" });
      }

      const votesAvg = perf.votesAvg ?? 0;
      const bonusEngagement = Math.min(10, (perf.commentsCount ?? 0) / 2);
      const scoreTotal = votesAvg * 0.8 + bonusEngagement * 0.2;

      const updated = await prisma.$transaction(async (tx) => {
        const p = await tx.performance.update({
          where: { id: perf.id },
          data: {
            endedAt: new Date(),
            scoreTotal,
            bonusEngagement,
          },
        });
        await tx.booking.update({
          where: { id: perf.bookingId },
          data: { status: "DONE" },
        });
        return p;
      });

      getIo()?.to(`event:${perf.eventId}`).emit("performance:end", {
        performance: updated,
        score: scoreTotal,
      });
      await emitQueueUpdate(perf.eventId);

      await recordPerformanceScore(perf.userId, scoreTotal);
      const entries = await getEventLeaderboard(perf.eventId);
      getIo()?.to(`event:${perf.eventId}`).emit("leaderboard:update", { entries });

      return reply.send(updated);
    }
  );
}
