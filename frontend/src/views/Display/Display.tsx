import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { io } from 'socket.io-client'
import CommentOverlay from '../../components/CommentOverlay/CommentOverlay'
import LeaderboardWidget from '../../components/Leaderboard/LeaderboardWidget'
import VoteMeter from '../../components/VoteMeter/VoteMeter'
import KaraokePlayer from '../../components/KaraokePlayer/KaraokePlayer'
import { Comment, Performance, Song, Booking, LeaderboardEntry, Event } from '../../store/useStore'
import api from '../../api/client'

interface PerformanceData {
  performance: Performance
  song: Song
  booking: Booking
  user: { id: string; nickname: string }
}

export default function Display() {
  const [eventId, setEventId] = useState<string | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [current, setCurrent] = useState<PerformanceData | null>(null)
  const [queue, setQueue] = useState<Booking[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [votesData, setVotesData] = useState<{ avg: number; count: number } | null>(null)
  const [showCelebration, setShowCelebration] = useState<{ score: number; user: string } | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [inputCode, setInputCode] = useState('')

  // Ask for event join code
  useEffect(() => {
    const stored = sessionStorage.getItem('display_eventId')
    const storedCode = sessionStorage.getItem('display_joinCode')
    if (stored && storedCode) {
      setEventId(stored)
      setJoinCode(storedCode)
    }
  }, [])

  const connectToEvent = async () => {
    try {
      const res = await api.get(`/events/${inputCode}`)
      const ev = res.data
      setEventId(ev.id)
      setEvent(ev)
      setJoinCode(inputCode)
      sessionStorage.setItem('display_eventId', ev.id)
      sessionStorage.setItem('display_joinCode', inputCode)

      // Load leaderboard
      const lb = await api.get(`/events/${ev.id}/leaderboard`)
      setLeaderboard(lb.data)
    } catch {
      alert('Serata non trovata')
    }
  }

  // Socket connection
  useEffect(() => {
    if (!eventId) return

    const WS_URL = import.meta.env.VITE_WS_URL || ''
    const socket = io(WS_URL, {
      auth: { eventId, role: 'display' },
    })

    socket.emit('display:ready')

    socket.on('queue:update', ({ queue }) => setQueue(queue))
    socket.on('event:status', ({ status }) => setEvent((e) => e ? { ...e, status } : e))
    socket.on('comment:new', ({ comment, user }) => {
      setComments((c) => [...c.slice(-50), { ...comment, user }])
    })
    socket.on('vote:update', ({ avg, count }) => setVotesData({ avg, count }))
    socket.on('leaderboard:update', ({ top10 }) => setLeaderboard(top10))

    socket.on('performance:start', (data: PerformanceData) => {
      setCurrent(data)
      setComments([])
      setVotesData(null)
    })

    socket.on('performance:end', ({ performance, score }) => {
      setShowCelebration({ score: score.total, user: current?.user.nickname || '' })
      setTimeout(() => {
        setShowCelebration(null)
        setCurrent(null)
      }, 6000)

      // Refresh leaderboard
      if (eventId) {
        api.get(`/events/${eventId}/leaderboard`).then((r) => setLeaderboard(r.data))
      }
    })

    return () => { socket.disconnect() }
  }, [eventId])

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card w-80 space-y-4 text-center">
          <div className="text-4xl">📺</div>
          <h2 className="text-xl font-bold">Schermo Display</h2>
          <input className="input" placeholder="Codice serata..." value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} />
          <button onClick={connectToEvent} className="btn-primary w-full">Connetti</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-900 relative overflow-hidden">
      {/* Celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80"
          >
            <Confetti />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10 }}
              className="text-center"
            >
              <div className="text-8xl mb-4">🎤</div>
              <h2 className="text-4xl font-bold text-white mb-2">{showCelebration.user}</h2>
              <div className="text-8xl font-bold text-yellow-400">{showCelebration.score.toFixed(1)}</div>
              <div className="text-2xl text-gray-300 mt-2">punti!</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {current ? (
        /* PERFORMING STATE */
        <div className="min-h-screen flex flex-col p-6 gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white">
                🎤 <span className="text-brand-400">{current.user.nickname}</span>
              </h2>
              <p className="text-gray-300 text-xl mt-1">
                {current.song.title}
                {current.song.artist && ` — ${current.song.artist}`}
              </p>
            </div>
            <div className="text-right">
              {votesData && <VoteMeter avg={votesData.avg} count={votesData.count} large />}
              <div className="mt-1">
                {current.song.source === 'MIDI'
                  ? <span className="badge-midi text-base px-3 py-1">⭐ Karaoke Ufficiale</span>
                  : <span className="badge-youtube text-base px-3 py-1">🎬 Free Style{current.booking.ytLrcFound ? ' con testo' : ''}</span>
                }
              </div>
            </div>
          </div>

          {/* Karaoke player */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-4xl">
              <KaraokePlayer song={current.song} booking={current.booking} eventId={eventId!} />
            </div>
          </div>

          {/* Comment overlay */}
          <div className="relative h-32">
            <CommentOverlay comments={comments} />
          </div>
        </div>
      ) : (
        /* IDLE STATE */
        <div className="min-h-screen flex flex-col p-8 gap-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-5xl font-bold text-brand-400">🎤 KARAOKE NIGHT</h1>
            {event && (
              <p className="text-gray-300 text-xl mt-2">
                {event.name} · {new Date(event.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            {joinCode && (
              <div className="mt-3">
                <span className="bg-brand-600/20 border border-brand-500/30 text-brand-300 text-2xl font-bold px-6 py-2 rounded-xl tracking-widest">
                  {joinCode}
                </span>
                <p className="text-gray-500 text-sm mt-1">Scansiona il QR o inserisci il codice</p>
              </div>
            )}
          </div>

          <div className="flex gap-6 flex-1">
            {/* Queue */}
            <div className="flex-1 card">
              <h3 className="text-lg font-bold text-brand-300 mb-3">🎵 Prossimi</h3>
              <div className="space-y-2">
                {queue.slice(0, 5).map((b, i) => (
                  <div key={b.id} className={`flex items-center gap-2 p-2 rounded-lg ${i === 0 ? 'bg-brand-600/20 border border-brand-500/20' : ''}`}>
                    <span className="text-gray-500 text-sm w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{b.song?.title || b.ytTitle || '...'}</p>
                      <p className="text-gray-400 text-sm truncate">{b.user.nickname}</p>
                    </div>
                  </div>
                ))}
                {queue.length === 0 && <p className="text-gray-500 text-sm">Nessuna prenotazione</p>}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="flex-1 card">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">🏆 Classifica</h3>
              <LeaderboardWidget entries={leaderboard} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    color: ['#f59e0b', '#8b5cf6', '#ec4899', '#10b981', '#3b82f6'][i % 5],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: `${6 + Math.random() * 10}px`,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece absolute"
          style={{
            left: p.left,
            top: '-20px',
            width: p.size,
            height: p.size,
            background: p.color,
            animationDuration: p.duration,
            animationDelay: p.delay,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
          }}
        />
      ))}
    </div>
  )
}
