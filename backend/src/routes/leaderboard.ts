import { FastifyInstance } from 'fastify'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'

export default async function leaderboardRoutes(fastify: FastifyInstance) {
  // GET /api/events/:eventId/leaderboard
  fastify.get('/events/:eventId/leaderboard', async (request) => {
    const { eventId } = request.params as { eventId: string }

    const performances = await prisma.performance.findMany({
      where: { eventId, endedAt: { not: null } },
      include: { user: { select: { id: true, nickname: true } } },
      orderBy: { scoreTotal: 'desc' },
    })

    // Group by user and average scores
    const byUser = new Map<string, { user: { id: string; nickname: string }; scores: number[] }>()
    for (const p of performances) {
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, { user: p.user, scores: [] })
      }
      if (p.scoreTotal !== null) {
        byUser.get(p.userId)!.scores.push(p.scoreTotal)
      }
    }

    const leaderboard = Array.from(byUser.values())
      .map(({ user, scores }) => ({
        user,
        avgScore: scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0,
        performances: scores.length,
        bestScore: scores.length ? Math.max(...scores) : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10)

    return leaderboard
  })

  // GET /api/leaderboard/global
  fastify.get('/leaderboard/global', async () => {
    const leaderboard = await prisma.leaderboard.findMany({
      include: { user: { select: { id: true, nickname: true } } },
      orderBy: { totalScore: 'desc' },
      take: 10,
    })
    return leaderboard
  })

  // GET /api/users/:id/stats
  fastify.get('/users/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string }

    const performances = await prisma.performance.findMany({
      where: { userId: id, endedAt: { not: null } },
    })

    const scores = performances.filter((p) => p.scoreTotal !== null).map((p) => p.scoreTotal as number)

    return {
      performances: performances.length,
      avgScore: scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
    }
  })

  // GET /api/users/me/stats
  fastify.get('/users/me/stats', { preHandler: authenticate }, async (request) => {
    const payload = request.user as { userId: string }
    const performances = await prisma.performance.findMany({
      where: { userId: payload.userId, endedAt: { not: null } },
    })
    const scores = performances.filter((p) => p.scoreTotal !== null).map((p) => p.scoreTotal as number)
    return {
      performances: performances.length,
      avgScore: scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
    }
  })
}
