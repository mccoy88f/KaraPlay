import { prisma } from '../index'

interface Vote {
  value: number
}

export const scoreService = {
  calculate(votes: Vote[], commentsCount: number) {
    const votesAvg = votes.length ? votes.reduce((sum, v) => sum + v.value, 0) / votes.length : 0
    const bonusEngagement = Math.min(10, commentsCount / 2)
    const total = parseFloat((votesAvg * 0.8 + bonusEngagement * 0.2).toFixed(2))
    return { total, votesAvg: parseFloat(votesAvg.toFixed(2)), bonusEngagement: parseFloat(bonusEngagement.toFixed(2)) }
  },

  async updateLeaderboard(userId: string, score: number) {
    const existing = await prisma.leaderboard.findUnique({ where: { userId } })
    if (existing) {
      const newTotal = existing.totalScore + score
      const newPerfs = existing.performances + 1
      await prisma.leaderboard.update({
        where: { userId },
        data: {
          totalScore: parseFloat((newTotal / newPerfs).toFixed(2)),
          performances: newPerfs,
          bestScore: existing.bestScore === null || score > existing.bestScore ? score : existing.bestScore,
        },
      })
    } else {
      await prisma.leaderboard.create({
        data: { userId, totalScore: score, performances: 1, bestScore: score },
      })
    }
  },

  async getEventLeaderboard(eventId: string) {
    const performances = await prisma.performance.findMany({
      where: { eventId, endedAt: { not: null } },
      include: { user: { select: { id: true, nickname: true } } },
    })
    const byUser = new Map<string, { user: { id: string; nickname: string }; scores: number[] }>()
    for (const p of performances) {
      if (!byUser.has(p.userId)) byUser.set(p.userId, { user: p.user, scores: [] })
      if (p.scoreTotal !== null) byUser.get(p.userId)!.scores.push(p.scoreTotal)
    }
    return Array.from(byUser.values())
      .map(({ user, scores }) => ({
        user,
        avgScore: scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0,
        performances: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10)
  },
}
