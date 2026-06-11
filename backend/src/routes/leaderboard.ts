import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { requireJwt } from "../middleware/jwt.js";
import type { JwtPayload } from "../types/jwt.js";
import { getEventLeaderboard, getGlobalLeaderboard } from "../services/leaderboard.service.js";

export async function registerLeaderboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { eventId: string } }>(
    "/events/:eventId/leaderboard",
    async (request, reply) => {
      const event = await prisma.event.findUnique({
        where: { id: request.params.eventId },
        select: { id: true },
      });
      if (!event) {
        return reply.code(404).send({ error: "Serata non trovata" });
      }
      const entries = await getEventLeaderboard(event.id);
      return reply.send({ entries });
    }
  );

  fastify.get("/leaderboard/global", async (_request, reply) => {
    const entries = await getGlobalLeaderboard();
    return reply.send({ entries });
  });

  /** Statistiche personali (esibizioni, media, best) per il tab profilo. */
  fastify.get("/users/me/stats", { preHandler: [requireJwt] }, async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const row = await prisma.leaderboard.findUnique({ where: { userId: jwt.sub } });
    const user = await prisma.user.findUnique({
      where: { id: jwt.sub },
      select: { nickname: true, email: true, emailVerified: true },
    });
    if (!user) {
      return reply.code(404).send({ error: "Utente non trovato" });
    }
    return reply.send({
      nickname: user.nickname,
      email: user.email,
      emailVerified: user.emailVerified,
      performances: row?.performances ?? 0,
      avgScore: row && row.performances > 0 ? Number((row.totalScore / row.performances).toFixed(2)) : null,
      bestScore: row?.bestScore != null ? Number(row.bestScore.toFixed(2)) : null,
    });
  });
}
