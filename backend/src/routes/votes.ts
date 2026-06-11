import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireJwt } from "../middleware/jwt.js";
import type { JwtPayload } from "../types/jwt.js";
import { getIo } from "../socket/io.js";

const voteSchema = z.object({
  value: z.number().int().min(1).max(10),
});

async function computeVoteStats(performanceId: string) {
  const votes = await prisma.vote.findMany({
    where: { performanceId },
    select: { value: true },
  });
  const count = votes.length;
  const avg = count > 0 ? votes.reduce((sum, v) => sum + v.value, 0) / count : 0;
  const distribution: Record<number, number> = {};
  for (const v of votes) {
    distribution[v.value] = (distribution[v.value] ?? 0) + 1;
  }
  return { avg: Number(avg.toFixed(2)), count, distribution };
}

export async function registerVoteRoutes(fastify: FastifyInstance): Promise<void> {
  /** Vota un'esibizione (1-10, un voto per utente, solo mentre è in corso). */
  fastify.post<{ Params: { id: string } }>(
    "/performances/:id/votes",
    { preHandler: [requireJwt] },
    async (request, reply) => {
      const parsed = voteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Voto non valido (intero 1-10)" });
      }
      const jwt = request.user as JwtPayload;
      const performance = await prisma.performance.findUnique({
        where: { id: request.params.id },
      });
      if (!performance) {
        return reply.code(404).send({ error: "Esibizione non trovata" });
      }
      if (performance.eventId !== jwt.eventId) {
        return reply.code(403).send({ error: "Token non valido per questa serata" });
      }
      if (performance.endedAt) {
        return reply.code(403).send({ error: "Votazione chiusa: esibizione terminata" });
      }
      if (performance.userId === jwt.sub) {
        return reply.code(403).send({ error: "Non puoi votare la tua esibizione" });
      }

      await prisma.vote.upsert({
        where: {
          performanceId_userId: { performanceId: performance.id, userId: jwt.sub },
        },
        create: {
          performanceId: performance.id,
          userId: jwt.sub,
          value: parsed.data.value,
        },
        update: { value: parsed.data.value },
      });

      const stats = await computeVoteStats(performance.id);
      await prisma.performance.update({
        where: { id: performance.id },
        data: { votesAvg: stats.avg },
      });

      getIo()
        ?.to(`event:${performance.eventId}`)
        .emit("vote:update", { performanceId: performance.id, ...stats });

      return reply.code(201).send({ ok: true, myVote: parsed.data.value, ...stats });
    }
  );

  /** Stato voti di un'esibizione (pubblico: serve anche al display, che non ha JWT). */
  fastify.get<{ Params: { id: string } }>("/performances/:id/votes", async (request, reply) => {
    const performance = await prisma.performance.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!performance) {
      return reply.code(404).send({ error: "Esibizione non trovata" });
    }
    const stats = await computeVoteStats(performance.id);

    let myVote: number | null = null;
    try {
      await request.jwtVerify();
      const jwt = request.user as JwtPayload;
      const mine = await prisma.vote.findUnique({
        where: { performanceId_userId: { performanceId: performance.id, userId: jwt.sub } },
        select: { value: true },
      });
      myVote = mine?.value ?? null;
    } catch {
      /* senza token: solo le statistiche aggregate */
    }

    return reply.send({ ...stats, myVote });
  });
}
