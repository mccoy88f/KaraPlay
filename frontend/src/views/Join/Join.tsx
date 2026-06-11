import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useStore } from '../../store/useStore'
import { io, Socket } from 'socket.io-client'
import LiveTab from './components/LiveTab'
import BookTab from './components/BookTab'
import LeaderboardTab from './components/LeaderboardTab'
import ProfileTab from './components/ProfileTab'

type Tab = 'live' | 'book' | 'leaderboard' | 'profile'

export default function Join() {
  const { joinCode: paramCode } = useParams<{ joinCode?: string }>()
  const { user, currentEvent, join } = useAuth()
  const { setQueue, addComment, setLeaderboard, setVotesData, setCurrentPerformance, setCurrentSong, setCurrentBooking } = useStore()
  const [tab, setTab] = useState<Tab>('live')
  const [joinCode, setJoinCode] = useState(paramCode || '')
  const [nickname, setNickname] = useState('')
  const [step, setStep] = useState<'code' | 'nickname' | 'joined'>(!user ? 'code' : 'joined')
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (user && currentEvent) setStep('joined')
  }, [user, currentEvent])

  useEffect(() => {
    if (!currentEvent || !user) return

    const WS_URL = import.meta.env.VITE_WS_URL || ''
    const s = io(WS_URL, {
      auth: { eventId: currentEvent.id, role: user.role },
    })
    setSocket(s)

    s.on('queue:update', ({ queue }) => setQueue(queue))
    s.on('comment:new', ({ comment, user: u }) => addComment({ ...comment, user: u }))
    s.on('leaderboard:update', ({ top10 }) => setLeaderboard(top10))
    s.on('vote:update', (data) => setVotesData(data))
    s.on('performance:start', ({ performance, song, booking }) => {
      setCurrentPerformance(performance)
      setCurrentSong(song)
      setCurrentBooking(booking)
    })
    s.on('performance:end', () => {
      setCurrentPerformance(null)
    })

    return () => { s.disconnect() }
  }, [currentEvent?.id, user?.id])

  const handleJoin = async () => {
    if (!nickname.trim() || !joinCode.trim()) return
    try {
      await join(nickname.trim(), joinCode.trim().toUpperCase())
      setStep('joined')
    } catch {
      alert('Serata non trovata o non disponibile')
    }
  }

  if (step === 'code') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-4 text-center">
          <div className="text-5xl">🎤</div>
          <h1 className="text-2xl font-bold">Unisciti alla Serata</h1>
          <input
            className="input text-center text-xl tracking-widest uppercase"
            placeholder="CODICE"
            value={joinCode}
            maxLength={8}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button onClick={() => { if (joinCode.trim()) setStep('nickname') }} className="btn-primary w-full">
            Avanti
          </button>
        </div>
      </div>
    )
  }

  if (step === 'nickname') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-4 text-center">
          <div className="text-5xl">👤</div>
          <h1 className="text-2xl font-bold">Come ti chiami?</h1>
          <input
            className="input text-center"
            placeholder="Il tuo nickname"
            value={nickname}
            maxLength={30}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin} disabled={!nickname.trim()} className="btn-primary w-full">
            Entra 🚀
          </button>
          <button onClick={() => setStep('code')} className="text-gray-500 text-sm">← Indietro</button>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'live', label: 'Live', icon: '🔴' },
    { id: 'book', label: 'Prenota', icon: '🎵' },
    { id: 'leaderboard', label: 'Classifica', icon: '🏆' },
    { id: 'profile', label: 'Profilo', icon: '👤' },
  ]

  return (
    <div className="min-h-screen flex flex-col pb-16">
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'live' && <LiveTab socket={socket} />}
        {tab === 'book' && <BookTab />}
        {tab === 'leaderboard' && <LeaderboardTab />}
        {tab === 'profile' && <ProfileTab />}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-dark-500 flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
              tab === t.id ? 'text-brand-400' : 'text-gray-500'
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
