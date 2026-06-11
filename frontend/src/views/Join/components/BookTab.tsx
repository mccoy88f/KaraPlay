import { useState } from 'react'
import { useStore } from '../../../store/useStore'
import SongSearch from '../../../components/SongSearch/SongSearch'
import { Song } from '../../../store/useStore'
import api from '../../../api/client'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

export default function BookTab() {
  const { currentEvent, queue, user } = useStore()
  const [booked, setBooked] = useState<{ title: string; position: number } | null>(null)

  const bookSong = async (song: Song) => {
    if (!currentEvent) return
    try {
      const res = await api.post(`/events/${currentEvent.id}/bookings`, { songId: song.id })
      setBooked({ title: song.title, position: res.data.position })
      toast.success('Prenotazione effettuata! 🎤')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Errore nella prenotazione')
    }
  }

  const bookYouTube = async (url: string, title: string, duration: number) => {
    if (!currentEvent) return
    try {
      const res = await api.post(`/events/${currentEvent.id}/bookings`, {
        ytUrl: url,
        ytTitle: title,
      })
      setBooked({ title, position: res.data.position })
      toast.success('Prenotazione YouTube inviata per approvazione!')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Errore')
    }
  }

  const myBookings = queue.filter((b) => b.userId === user?.id)

  return (
    <div className="p-4 space-y-4">
      <AnimatePresence>
        {booked && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="card bg-green-500/10 border-green-500/30 text-center"
          >
            <div className="text-3xl mb-1">✅</div>
            <p className="font-bold">{booked.title}</p>
            <p className="text-gray-400 text-sm">Posizione in coda: #{booked.position}</p>
            <button onClick={() => setBooked(null)} className="text-gray-500 text-xs mt-2">Chiudi</button>
          </motion.div>
        )}
      </AnimatePresence>

      {myBookings.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-sm text-gray-300 mb-2">Le tue prenotazioni</h3>
          {myBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-1 text-sm">
              <span className="truncate">{b.song?.title || b.ytTitle}</span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                b.status === 'PERFORMING' ? 'bg-green-500/20 text-green-300' :
                b.status === 'READY' ? 'bg-blue-500/20 text-blue-300' :
                b.status === 'PROCESSING' ? 'bg-yellow-500/20 text-yellow-300' :
                'bg-gray-500/20 text-gray-300'
              }`}>
                {b.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <SongSearch onSelect={bookSong} onYouTube={bookYouTube} />
    </div>
  )
}
