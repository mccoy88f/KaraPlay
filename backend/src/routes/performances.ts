import { FastifyInstance } from 'fastify'
import { prisma } from '../index'
import { requireAdmin } from '../middleware/admin'
import { scoreService } from '../services/score.service'

export default async function performanceRoutes(fastify: FastifyInstance) {
  // POST /api/admin/performances/start/:bookingId
  fastify.post('/admin/performances/start/:bookingId', { preHandler: requireAdmin }, async (request, reply) => {
    const { bookingId } = request.params as { bookingId: string }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { song: true, user: true },
    })
    if (!booking) return reply.code(404).send({ error: 'Booking not found' })
    if (!['APPROVED', 'READY'].includes(booking.status)) {
      return reply.code(400).send({ error: 'Booking not ready for performance' })
    }

    const performance = await prisma.performance.create({
      data: {
        eventId: booking.eventId,
        bookingId: booking.id,
        userId: booking.userId,
        startedAt: new Date(),
      },
    })

    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PERFORMING' } })

    const io = (fastify as any).io
    io.to(`event:${booking.eventId}`).emit('performance:start', {
      performance,
      booking,
      song: booking.song,
      user: booking.user,
    })

    return performance
  })

  // POST /api/admin/performances/:id/end
  fastify.post('/admin/performances/:id/end', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const performance = await prisma.performance.findUnique({
      where: { id },
      include: { votes: true, comments: true, booking: true },
    })
    if (!performance) return reply.code(404).send({ error: 'Performance not found' })

    const score = scoreService.calculate(performance.votes, performance.comments.length)

    const updated = await prisma.performance.update({
      where: { id },
      data: {
        endedAt: new Date(),
        scoreTotal: score.total,
        votesAvg: score.votesAvg,
        commentsCount: performance.comments.length,
        bonusEngagement: score.bonusEngagement,
      },
    })

    await prisma.booking.update({ where: { id: performance.bookingId }, data: { status: 'DONE' } })

    // Update leaderboard
    await scoreService.updateLeaderboard(performance.userId, score.total)

    const io = (fastify as any).io
    io.to(`event:${performance.eventId}`).emit('performance:end', { performance: updated, score })

    // Send updated leaderboard
    const top10 = await scoreService.getEventLeaderboard(performance.eventId)
    io.to(`event:${performance.eventId}`).emit('leaderboard:update', { top10 })

    return updated
  })

  // GET /api/performances/:id
  fastify.get('/performances/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const performance = await prisma.performance.findUnique({
      where: { id },
      include: {
        booking: { include: { song: true } },
        user: { select: { id: true, nickname: true } },
        votes: true,
        comments: { include: { user: { select: { id: true, nickname: true } } } },
      },
    })
    if (!performance) return reply.code(404).send({ error: 'Performance not found' })
    return performance
  })

  // GET /api/admin/performances/current/:eventId
  fastify.get('/admin/performances/current/:eventId', { preHandler: requireAdmin }, async (request) => {
    const { eventId } = request.params as { eventId: string }
    const booking = await prisma.booking.findFirst({
      where: { eventId, status: 'PERFORMING' },
      include: {
        performance: { include: { votes: true, comments: true } },
        song: true,
        user: { select: { id: true, nickname: true } },
      },
    })
    return booking
  })
}
