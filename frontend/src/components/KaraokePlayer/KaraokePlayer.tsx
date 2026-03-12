import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useKaraokePlayer } from '../../hooks/useKaraokePlayer'
import { Song, Booking } from '../../store/useStore'

interface Props {
  song: Song
  booking: Booking
  eventId: string
  onEnd?: () => void
  showControls?: boolean
}

export default function KaraokePlayer({ song, booking, eventId, onEnd, showControls = false }: Props) {
  const { isPlaying, currentTime, duration, currentLineIndex, lrcLines, loadMidi, loadYoutube, play, pause, stop } = useKaraokePlayer(eventId)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    if (song.source === 'MIDI' && song.midiPath) {
      const lrcUrl = song.lrcPath ? `${API}/api/media/lrc/${song.id}` : undefined
      const loadWithLrc = async () => {
        let lrcText: string | undefined
        if (lrcUrl) {
          const res = await fetch(lrcUrl)
          if (res.ok) lrcText = await res.text()
        }
        loadMidi(`${API}/api/media/midi/${song.id}`, lrcText)
      }
      loadWithLrc()
    } else if (song.source === 'YOUTUBE') {
      const audioUrl = `${API}/api/media/yt/${booking.id}`
      const loadWithLrc = async () => {
        let lrcText: string | undefined
        if (booking.ytLrcFound && song.lrcPath) {
          const res = await fetch(`${API}/api/media/lrc/${song.id}`)
          if (res.ok) lrcText = await res.text()
        }
        loadYoutube(audioUrl, lrcText)
      }
      loadWithLrc()
    }
  }, [song.id])

  const progress = duration ? (currentTime / duration) * 100 : 0
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const prevLine = currentLineIndex > 0 ? lrcLines[currentLineIndex - 1]?.text : null
  const currentLine = lrcLines[currentLineIndex]?.text || ''
  const nextLine = lrcLines[currentLineIndex + 1]?.text || null

  return (
    <div className="w-full">
      {/* Lyrics display */}
      <div className="text-center min-h-[160px] flex flex-col justify-center gap-3 px-4">
        {prevLine && (
          <div className="text-gray-500 text-lg md:text-xl transition-all">{prevLine}</div>
        )}
        {currentLine && (
          <motion.div
            key={currentLineIndex}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-white text-2xl md:text-4xl font-bold leading-tight"
          >
            {currentLine}
          </motion.div>
        )}
        {!currentLine && lrcLines.length === 0 && (
          <div className="text-gray-400 text-xl italic">🎤 Free Style</div>
        )}
        {nextLine && (
          <div className="text-gray-400 text-lg md:text-2xl transition-all">{nextLine}</div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-4 px-4">
        <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-brand-500 rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ ease: 'linear' }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls (admin only) */}
      {showControls && (
        <div className="flex justify-center gap-3 mt-4">
          {!isPlaying ? (
            <button onClick={play} className="btn-primary px-6">▶ Play</button>
          ) : (
            <button onClick={pause} className="btn-secondary px-6">⏸ Pausa</button>
          )}
          <button onClick={stop} className="btn-secondary px-4">⏹ Stop</button>
        </div>
      )}
    </div>
  )
}
