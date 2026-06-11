import { prisma } from "../lib/prisma.js";

export type LeaderboardEntry = {
  userId: string;
  nickname: string;
  avgScore: number;
  bestScore: number;
  performances: number;
};

/** Aggiorna la classifica storica dell'utente a fine esibizione. */
export async function recordPerformanceScore(userId: string, score: number): Promise<void> {
  const existing = await prisma.leaderboard.findUnique({ where: { userId } });
  if (!existing) {
    await prisma.leaderboard.create({
      data: {
        userId,
        totalScore: score,
        performances: 1,
        bestScore: score,
      },
    });
    return;
  }
  await prisma.leaderboard.update({
    where: { userId },
    data: {
      totalScore: existing.totalScore + score,
      performances: existing.performances + 1,
      bestScore: Math.max(existing.bestScore ?? 0, score),
    },
  });
}

/** Classifica serata: media dei punteggi delle esibizioni concluse di ogni cantante. */
export async function getEventLeaderboard(eventId: string, top = 10): Promise<LeaderboardEntry[]> {
  const performances = await prisma.performance.findMany({
    where: { eventId, endedAt: { not: null }, scoreTotal: { not: null } },
    select: {
      userId: true,
      scoreTotal: true,
      user: { select: { nickname: true } },
    },
  });

  const byUser = new Map<string, { nickname: string; scores: number[] }>();
  for (const p of performances) {
    const entry = byUser.get(p.userId) ?? { nickname: p.user.nickname, scores: [] };
    entry.scores.push(p.scoreTotal ?? 0);
    byUser.set(p.userId, entry);
  }

  const entries: LeaderboardEntry[] = [...byUser.entries()].map(([userId, e]) => ({
    userId,
    nickname: e.nickname,
    avgScore: Number((e.scores.reduce((a, b) => a + b, 0) / e.scores.length).toFixed(2)),
    bestScore: Number(Math.max(...e.scores).toFixed(2)),
    performances: e.scores.length,
  }));

  entries.sort((a, b) => b.avgScore - a.avgScore || b.bestScore - a.bestScore);
  return entries.slice(0, top);
}

/** Classifica storica cross-serata dalla tabella Leaderboard. */
export async function getGlobalLeaderboard(top = 10): Promise<LeaderboardEntry[]> {
  const rows = await prisma.leaderboard.findMany({
    where: { performances: { gt: 0 } },
    include: { user: { select: { nickname: true } } },
  });
  const entries: LeaderboardEntry[] = rows.map((r) => ({
    userId: r.userId,
    nickname: r.user.nickname,
    avgScore: Number((r.totalScore / r.performances).toFixed(2)),
    bestScore: Number((r.bestScore ?? 0).toFixed(2)),
    performances: r.performances,
  }));
  entries.sort((a, b) => b.avgScore - a.avgScore || b.bestScore - a.bestScore);
  return entries.slice(0, top);
}
