import { motion } from 'framer-motion'
import { LeaderboardEntry } from '../../store/useStore'

const medals = ['🥇', '🥈', '🥉']

interface Props {
  entries: LeaderboardEntry[]
  currentUserId?: string
  compact?: boolean
}

export default function LeaderboardWidget({ entries, currentUserId, compact = false }: Props) {
  return (
    <div className="space-y-2">
      {entries.slice(0, compact ? 5 : 10).map((entry, i) => (
        <motion.div
          key={entry.user.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`flex items-center gap-3 p-2 rounded-lg ${
            entry.user.id === currentUserId ? 'bg-brand-600/20 border border-brand-500/30' : 'bg-dark-600/50'
          }`}
        >
          <span className="w-6 text-center font-bold text-sm">
            {i < 3 ? medals[i] : <span className="text-gray-400">{i + 1}</span>}
          </span>
          <span className="flex-1 font-medium truncate">{entry.user.nickname}</span>
          <span className="text-yellow-400 font-bold text-sm">{entry.avgScore.toFixed(1)}</span>
        </motion.div>
      ))}
      {entries.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">Nessuna esibizione ancora</p>
      )}
    </div>
  )
}
