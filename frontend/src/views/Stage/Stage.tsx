import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { io } from 'socket.io-client'
import api from '../../api/client'
import { Song, Booking, Performance } from '../../store/useStore'

interface PerformanceData {
  performance: Performance
  song: Song
  booking: Booking
  user: { id: string; nickname: string }
}

export default function Stage() {
  const [eventId, setEventId] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [current, setCurrent] = useState<PerformanceData | null>(null)
  const [nextBooking, setNextBooking] = useState<Booking | null>(null)
  const [votes, setVotes] = useState<{ avg: number; count: number } | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [lrcLines, setLrcLines] = useState<Array<{ time: number; text: string }>>([])
  const [currentLineIdx, setCurrentLineIdx] = useState(-1)

  const connectToEvent = async () => {
    try {
      const res = await api.get(`/events/${inputCode}`)
      setEventId(res.data.id)
      sessionStorage.setItem('stage_eventId', res.data.id)
    } catch {
      alert('Serata non trovata')
    }
  }

  useEffect(() => {
    const stored = sessionStorage.getItem('stage_eventId')
    if (stored) setEventId(stored)
  }, [])

  useEffect(() => {
    if (!eventId) return

    const WS_URL = import.meta.env.VITE_WS_URL || ''
    const socket = io(WS_URL, { auth: { eventId, role: 'stage' } })
    socket.emit('stage:ready')

    socket.on('queue:update', ({ queue }) => {
      setNextBooking(queue[0] || null)
    })

    socket.on('performance:start', (data: PerformanceData) => {
      setCurrent(data)
      setVotes(null)
      setCountdown(3)

      // Load LRC if available
      if (data.song.lrcPath) {
        const API = import.meta.env.VITE_API_URL || ''
        fetch(`${API}/api/media/lrc/${data.song.id}`)
          .then((r) => r.text())
          .then((lrc) => {
            const lines = parseLrc(lrc)
            setLrcLines(lines)
          })
      } else {
        setLrcLines([])
      }
    })

    socket.on('performance:end', () => {
      setCurrent(null)
      setCountdown(null)
      setCurrentLineIdx(-1)
    })

    socket.on('vote:update', ({ avg, count }) => setVotes({ avg, count }))

    socket.on('lyric:line', ({ lineIndex }) => {
      setCurrentLineIdx(lineIndex)
    })

    socket.on('lyric:highlight', ({ lineIndex }) => {
      setCurrentLineIdx(lineIndex)
    })

    return () => { socket.disconnect() }
  }, [eventId])

  // Countdown effect
  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const t = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card w-80 space-y-4 text-center">
          <div className="text-4xl">🎤</div>
          <h2 className="text-xl font-bold">Schermo Cantante</h2>
          <input className="input" placeholder="Codice serata..." value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} />
          <button onClick={connectToEvent} className="btn-primary w-full">Connetti</button>
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">🎤</div>
        <h1 className="text-4xl font-bold text-brand-400">Sei pronto?</h1>
        {nextBooking && (
          <div className="card max-w-sm text-center">
            <p className="text-gray-400 text-sm">Prossima canzone:</p>
            <p className="font-bold text-xl mt-1">{nextBooking.song?.title || nextBooking.ytTitle}</p>
            {nextBooking.song?.artist && <p className="text-gray-300">{nextBooking.song.artist}</p>}
          </div>
        )}
        {!nextBooking && <p className="text-gray-400">In attesa della prima esibizione...</p>}
      </div>
    )
  }

  const prevLine = currentLineIdx > 0 ? lrcLines[currentLineIdx - 1]?.text : null
  const currentLine = lrcLines[currentLineIdx]?.text || ''
  const nextLine = lrcLines[currentLineIdx + 1]?.text || null

  return (
    <div className="min-h-screen flex flex-col p-6 gap-6">
      {/* Countdown */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/90 z-50"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="text-9xl font-bold text-brand-400"
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Song info */}
      <div className="text-center">
        <p className="text-gray-400 text-lg">Stai cantando:</p>
        <h2 className="text-4xl font-bold text-white mt-1">
          {current.song.title || current.booking.ytTitle}
        </h2>
        {current.song.artist && <p className="text-2xl text-gray-300 mt-1">{current.song.artist}</p>}
      </div>

      {/* Live score */}
      {votes && (
        <div className="text-center">
          <span className="text-yellow-400 text-2xl">★</span>
          <span className="text-4xl font-bold ml-2">{votes.avg.toFixed(1)}</span>
          <span className="text-gray-400 ml-2">({votes.count} voti)</span>
        </div>
      )}

      {/* Lyrics - large for stage reading */}
      <div className="flex-1 flex flex-col justify-center text-center gap-4">
        {prevLine && <p className="text-gray-400 text-2xl">{prevLine}</p>}
        {currentLine && (
          <motion.p
            key={currentLineIdx}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-white text-4xl md:text-6xl font-bold leading-tight text-brand-100"
          >
            {currentLine}
          </motion.p>
        )}
        {!currentLine && lrcLines.length === 0 && (
          <p className="text-gray-400 text-3xl italic">🎤 Free Style — canta!</p>
        )}
        {nextLine && <p className="text-gray-500 text-2xl">{nextLine}</p>}
      </div>
    </div>
  )
}

function parseLrc(lrc: string): Array<{ time: number; text: string }> {
  const lines: Array<{ time: number; text: string }> = []
  for (const line of lrc.split('\n')) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
    if (!match) continue
    const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3].padEnd(3, '0')) / 1000
    lines.push({ time, text: match[4].trim().replace(/<[^>]+>/g, '') })
  }
  return lines.sort((a, b) => a.time - b.time)
}
