import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'

export default async function voteRoutes(fastify: FastifyInstance) {
  // POST /api/performances/:id/votes
  fastify.post('/performances/:id/votes', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const payload = request.user as { userId: string; role: string }

    const schema = z.object({ value: z.number().int().min(1).max(10) })
    const { value } = schema.parse(request.body)

    const performance = await prisma.performance.findUnique({ where: { id } })
    if (!performance) return reply.code(404).send({ error: 'Performance not found' })
    if (!performance.startedAt || performance.endedAt) {
      return reply.code(400).send({ error: 'Voting not open for this performance' })
    }
    if (performance.userId === payload.userId) {
      return reply.code(400).send({ error: 'Cannot vote on your own performance' })
    }
    if (payload.role === 'admin') {
      return reply.code(400).send({ error: 'Admins cannot vote' })
    }

    const vote = await prisma.vote.upsert({
      where: { performanceId_userId: { performanceId: id, userId: payload.userId } },
      create: { performanceId: id, userId: payload.userId, value },
      update: { value },
    })

    // Emit updated vote stats
    const votes = await prisma.vote.findMany({ where: { performanceId: id } })
    const avg = votes.reduce((sum, v) => sum + v.value, 0) / votes.length
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      value: i + 1,
      count: votes.filter((v) => v.value === i + 1).length,
    }))

    const io = (fastify as any).io
    io.to(`event:${performance.eventId}`).emit('vote:update', { avg: parseFloat(avg.toFixed(2)), count: votes.length, distribution })

    return vote
  })
}
