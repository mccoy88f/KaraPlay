import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireJwt } from "../middleware/jwt.js";
import type { JwtPayload } from "../types/jwt.js";
import { getIo } from "../socket/io.js";

const commentSchema = z.object({
  text: z.string().min(1).max(120),
  emoji: z.string().max(16).optional(),
});

export async function registerCommentRoutes(fastify: FastifyInstance): Promise<void> {
  /** Commento live su un'esibizione in corso. */
  fastify.post<{ Params: { id: string } }>(
    "/performances/:id/comments",
    { preHandler: [requireJwt] },
    async (request, reply) => {
      const parsed = commentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Commento non valido (max 120 caratteri)" });
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
        return reply.code(403).send({ error: "Commenti chiusi: esibizione terminata" });
      }

      const [comment] = await prisma.$transaction([
        prisma.comment.create({
          data: {
            performanceId: performance.id,
            userId: jwt.sub,
            text: parsed.data.text.trim(),
            emoji: parsed.data.emoji ?? null,
          },
          include: { user: { select: { id: true, nickname: true } } },
        }),
        prisma.performance.update({
          where: { id: performance.id },
          data: { commentsCount: { increment: 1 } },
        }),
      ]);

      getIo()?.to(`event:${performance.eventId}`).emit("comment:new", {
        performanceId: performance.id,
        comment: {
          id: comment.id,
          text: comment.text,
          emoji: comment.emoji,
          createdAt: comment.createdAt,
        },
        user: { nickname: comment.user.nickname },
      });

      return reply.code(201).send(comment);
    }
  );

  /** Ultimi commenti di un'esibizione (pubblico: usato dal display al ricaricamento). */
  fastify.get<{ Params: { id: string } }>("/performances/:id/comments", async (request, reply) => {
    const performance = await prisma.performance.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!performance) {
      return reply.code(404).send({ error: "Esibizione non trovata" });
    }
    const comments = await prisma.comment.findMany({
      where: { performanceId: performance.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { nickname: true } } },
    });
    return reply.send({ comments });
  });
}
