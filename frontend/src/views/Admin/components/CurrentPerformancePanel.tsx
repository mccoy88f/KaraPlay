import { useState, useEffect } from 'react'
import api from '../../../api/client'
import toast from 'react-hot-toast'
import { io } from 'socket.io-client'
import VoteMeter from '../../../components/VoteMeter/VoteMeter'
import KaraokePlayer from '../../../components/KaraokePlayer/KaraokePlayer'

interface Props { eventId: string }

export default function CurrentPerformancePanel({ eventId }: Props) {
  const [current, setCurrent] = useState<any>(null)
  const [votes, setVotes] = useState<{ avg: number; count: number } | null>(null)
  const [recentComments, setRecentComments] = useState<any[]>([])

  useEffect(() => {
    loadCurrent()

    const WS_URL = import.meta.env.VITE_WS_URL || ''
    const socket = io(WS_URL, { auth: { eventId, role: 'admin' } })

    socket.on('performance:start', (data) => {
      setCurrent(data)
      setVotes(null)
      setRecentComments([])
    })
    socket.on('performance:end', () => setCurrent(null))
    socket.on('vote:update', ({ avg, count }) => setVotes({ avg, count }))
    socket.on('comment:new', ({ comment, user }) => {
      setRecentComments((c) => [...c.slice(-5), { ...comment, user }])
    })

    return () => { socket.disconnect() }
  }, [eventId])

  const loadCurrent = async () => {
    const res = await api.get(`/admin/performances/current/${eventId}`)
    if (res.data) setCurrent(res.data)
  }

  const endPerformance = async () => {
    if (!current?.performance?.id) return
    try {
      await api.post(`/admin/performances/${current.performance.id}/end`)
      toast.success('Esibizione terminata!')
      setCurrent(null)
    } catch {
      toast.error('Errore')
    }
  }

  if (!current?.performance) {
    return (
      <div className="text-center py-10 text-gray-500">
        <div className="text-5xl mb-3">🎤</div>
        <p>Nessuna esibizione in corso</p>
        <p className="text-sm">Avvia una dalla coda</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-400 text-xs font-bold uppercase">Live</span>
            </div>
            <h2 className="font-bold text-xl">{current.user?.nickname}</h2>
            <p className="text-gray-300">{current.song?.title || current.booking?.ytTitle}</p>
          </div>
          {votes && <VoteMeter avg={votes.avg} count={votes.count} />}
        </div>

        {current.song && (
          <KaraokePlayer
            song={current.song}
            booking={current.booking}
            eventId={eventId}
            showControls
          />
        )}
      </div>

      {/* Recent comments */}
      {recentComments.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Ultimi commenti</h3>
          <div className="space-y-1">
            {recentComments.map((c, i) => (
              <div key={i} className="text-sm flex gap-2">
                <span className="text-brand-400 font-bold">{c.user.nickname}:</span>
                <span className="text-gray-300">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={endPerformance}
        className="btn-secondary w-full border-red-500/30 text-red-300 hover:bg-red-500/10 text-lg py-3"
      >
        ⏹ Termina Esibizione
      </button>
    </div>
  )
}
