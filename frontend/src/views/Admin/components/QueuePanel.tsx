import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../../api/client'
import toast from 'react-hot-toast'
import { io } from 'socket.io-client'

interface Props { eventId: string }

export default function QueuePanel({ eventId }: Props) {
  const [queue, setQueue] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadQueue()

    const WS_URL = import.meta.env.VITE_WS_URL || ''
    const socket = io(WS_URL, { auth: { eventId, role: 'admin' } })
    socket.on('queue:update', ({ queue }) => setQueue(queue))
    return () => { socket.disconnect() }
  }, [eventId])

  const loadQueue = async () => {
    const res = await api.get(`/events/${eventId}/queue`)
    setQueue(res.data)
  }

  const startPerformance = async (bookingId: string) => {
    setLoading(true)
    try {
      await api.post(`/admin/performances/start/${bookingId}`)
      toast.success('Esibizione avviata!')
      loadQueue()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const skip = async (id: string) => {
    await api.put(`/admin/bookings/${id}/skip`)
    toast.success('Saltato')
  }

  const moveUp = async (id: string, pos: number) => {
    if (pos <= 1) return
    await api.put(`/admin/bookings/${id}/position`, { position: pos - 1 })
  }

  const moveDown = async (id: string, pos: number) => {
    await api.put(`/admin/bookings/${id}/position`, { position: pos + 1 })
  }

  const statusBadge: Record<string, string> = {
    APPROVED: 'bg-blue-500/20 text-blue-300',
    READY: 'bg-green-500/20 text-green-300',
    PROCESSING: 'bg-yellow-500/20 text-yellow-300 animate-pulse',
    PERFORMING: 'bg-red-500/20 text-red-300',
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">📋 Coda ({queue.length})</h2>
        <button onClick={loadQueue} className="text-gray-400 text-sm hover:text-white">↻ Aggiorna</button>
      </div>

      <AnimatePresence>
        {queue.map((b, i) => (
          <motion.div
            key={b.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className={`card ${b.status === 'PERFORMING' ? 'border-red-500/40 bg-red-500/5' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-1">
                <button onClick={() => moveUp(b.id, b.position)} className="text-gray-500 hover:text-white text-xs">▲</button>
                <span className="text-gray-500 text-xs text-center">{b.position}</span>
                <button onClick={() => moveDown(b.id, b.position)} className="text-gray-500 hover:text-white text-xs">▼</button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{b.song?.title || b.ytTitle || '...'}</span>
                  {b.song?.source === 'MIDI' && <span className="badge-midi">MIDI</span>}
                  {b.ytUrl && <span className="badge-youtube">YT</span>}
                </div>
                <p className="text-gray-400 text-sm">👤 {b.user.nickname}</p>
                {b.song?.artist && <p className="text-gray-500 text-xs">{b.song.artist}</p>}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[b.status] || 'bg-gray-500/20 text-gray-300'}`}>
                  {b.status}
                </span>
                {b.status === 'PERFORMING' ? null : (
                  <div className="flex gap-1 mt-1">
                    {['APPROVED', 'READY'].includes(b.status) && (
                      <button
                        onClick={() => startPerformance(b.id)}
                        disabled={loading}
                        className="btn-primary text-xs px-2 py-1"
                      >
                        ▶ Avvia
                      </button>
                    )}
                    <button onClick={() => skip(b.id)} className="btn-secondary text-xs px-2 py-1">
                      ⏭
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {queue.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <p>Nessuna prenotazione in coda</p>
        </div>
      )}
    </div>
  )
}
