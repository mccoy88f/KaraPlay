import { useState } from 'react'
import { Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../../store/useStore'
import VoteMeter from '../../../components/VoteMeter/VoteMeter'
import api from '../../../api/client'
import toast from 'react-hot-toast'

const EMOJIS = ['🔥', '❤️', '👏', '😂', '🎤', '🌟', '💜', '🎵']

interface Props {
  socket: any
}

export default function LiveTab({ socket }: Props) {
  const { currentPerformance, currentSong, currentBooking, votesData, comments, user } = useStore()
  const [comment, setComment] = useState('')
  const [myVote, setMyVote] = useState<number | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)

  const sendComment = async () => {
    if (!comment.trim() || !currentPerformance) return
    try {
      await api.post(`/performances/${currentPerformance.id}/comments`, { text: comment.trim() })
      setComment('')
    } catch {
      toast.error('Errore nel commento')
    }
  }

  const castVote = async (value: number) => {
    if (!currentPerformance || !user) return
    if (currentPerformance.userId === user.id) {
      toast.error('Non puoi votare la tua esibizione')
      return
    }
    try {
      await api.post(`/performances/${currentPerformance.id}/votes`, { value })
      setMyVote(value)
      toast.success(`Voto ${value}/10 inviato!`)
    } catch {
      toast.error('Errore nel voto')
    }
  }

  const addEmoji = (emoji: string) => {
    setComment((c) => c + emoji)
    setShowEmoji(false)
  }

  if (!currentPerformance) {
    return (
      <div className="p-4 space-y-4">
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">🎤</div>
          <p className="text-gray-400">Nessuna esibizione in corso</p>
          <p className="text-gray-500 text-sm mt-1">Aspetta il prossimo cantante!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Now playing */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 text-xs font-bold uppercase">Live</span>
        </div>
        <p className="font-bold text-lg">{currentSong?.title || currentBooking?.ytTitle}</p>
        {currentSong?.artist && <p className="text-gray-400">{currentSong.artist}</p>}
        {votesData && <div className="mt-2"><VoteMeter avg={votesData.avg} count={votesData.count} /></div>}
      </div>

      {/* Vote slider */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm text-gray-300">Il tuo voto</h3>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
            <button
              key={v}
              onClick={() => castVote(v)}
              disabled={currentPerformance.userId === user?.id}
              className={`flex-1 aspect-square text-xs rounded transition-all ${
                myVote === v
                  ? 'bg-brand-500 text-white font-bold scale-110'
                  : v <= (myVote || 0)
                  ? 'bg-brand-600/40 text-brand-300'
                  : 'bg-dark-500 text-gray-400 hover:bg-dark-400'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {myVote && <p className="text-center text-brand-300 text-sm font-medium">Hai votato {myVote}/10 ⭐</p>}
      </div>

      {/* Comments */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm text-gray-300">Commenti</h3>
        <div className="max-h-40 overflow-y-auto space-y-2">
          <AnimatePresence>
            {comments.slice(-10).map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2 text-sm"
              >
                <span className="text-brand-400 font-bold shrink-0">{c.user.nickname}:</span>
                <span className="text-gray-200">{c.text} {c.emoji}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {comments.length === 0 && <p className="text-gray-500 text-xs">Sii il primo a commentare!</p>}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="input pr-10"
              placeholder="Il tuo commento..."
              value={comment}
              maxLength={120}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendComment()}
            />
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-lg"
            >
              😊
            </button>
            {showEmoji && (
              <div className="absolute bottom-full left-0 bg-dark-700 border border-dark-500 rounded-lg p-2 grid grid-cols-4 gap-1 z-10">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => addEmoji(e)} className="text-2xl hover:scale-125 transition-transform">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={sendComment} disabled={!comment.trim()} className="btn-primary px-3">
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}
