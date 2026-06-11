import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'

export default async function commentRoutes(fastify: FastifyInstance) {
  // POST /api/performances/:id/comments
  fastify.post('/performances/:id/comments', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { userId: string }

    const schema = z.object({
      text: z.string().min(1).max(120),
      emoji: z.string().optional(),
    })
    const body = schema.parse(request.body)

    const performance = await prisma.performance.findUnique({ where: { id } })
    if (!performance) return reply.code(404).send({ error: 'Performance not found' })

    const [comment] = await Promise.all([
      prisma.comment.create({
        data: { performanceId: id, userId: payload.userId, text: body.text, emoji: body.emoji },
        include: { user: { select: { id: true, nickname: true } } },
      }),
      prisma.performance.update({
        where: { id },
        data: { commentsCount: { increment: 1 } },
      }),
    ])

    const io = (fastify as any).io
    io.to(`event:${performance.eventId}`).emit('comment:new', { comment, user: comment.user })

    return comment
  })

  // GET /api/performances/:id/comments
  fastify.get('/performances/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string }
    const comments = await prisma.comment.findMany({
      where: { performanceId: id },
      include: { user: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return comments
  })
}
