import { motion } from 'framer-motion'

interface Props {
  avg: number
  count: number
  large?: boolean
}

export default function VoteMeter({ avg, count, large = false }: Props) {
  const color = avg >= 8 ? 'text-green-400' : avg >= 6 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className={`flex items-center gap-2 ${large ? 'text-3xl' : 'text-sm'}`}>
      <span className="text-yellow-400">★</span>
      <span className={`font-bold ${color}`}>{avg > 0 ? avg.toFixed(1) : '--'}</span>
      <span className="text-gray-400 text-sm">({count} voti)</span>
    </div>
  )
}
