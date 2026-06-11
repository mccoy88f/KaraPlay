import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Comment } from '../../store/useStore'

interface Props {
  comments: Comment[]
}

export default function CommentOverlay({ comments }: Props) {
  const [visible, setVisible] = useState<Comment[]>([])

  useEffect(() => {
    const latest = comments.slice(-5)
    setVisible(latest)
  }, [comments])

  return (
    <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {visible.map((c, i) => (
          <motion.div
            key={`${c.user.id}-${c.createdAt}`}
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 50, opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-black/60 backdrop-blur-sm text-white rounded-full px-4 py-2 text-sm
                       border border-white/10 flex items-center gap-2 max-w-sm"
          >
            <span className="text-brand-400 font-bold shrink-0">{c.user.nickname}</span>
            <span className="truncate">{c.text}</span>
            {c.emoji && <span className="shrink-0">{c.emoji}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
