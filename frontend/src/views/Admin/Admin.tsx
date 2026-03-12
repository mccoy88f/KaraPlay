import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { io } from 'socket.io-client'
import api from '../../api/client'
import toast from 'react-hot-toast'
import EventControl from './components/EventControl'
import QueuePanel from './components/QueuePanel'
import PendingApprovals from './components/PendingApprovals'
import CurrentPerformancePanel from './components/CurrentPerformancePanel'
import SongManager from './components/SongManager'

export default function Admin() {
  const { user, adminLogin, logout } = useAuth()
  const [token, setToken] = useState('')
  const [events, setEvents] = useState<any[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'event' | 'queue' | 'pending' | 'current' | 'songs'>('event')

  useEffect(() => {
    if (user?.role === 'admin') {
      loadEvents()
    }
  }, [user?.role])

  const loadEvents = async () => {
    try {
      const res = await api.get('/admin/events')
      setEvents(res.data)
      if (res.data.length > 0 && !selectedEventId) {
        setSelectedEventId(res.data[0].id)
      }
    } catch {
      toast.error('Errore nel caricamento')
    }
  }

  const handleLogin = () => {
    adminLogin(token)
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-4 text-center">
          <div className="text-5xl">🎛️</div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <input
            className="input text-center"
            type="password"
            placeholder="Token admin"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="btn-primary w-full">Accedi</button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'event', label: '⚙️ Serata' },
    { id: 'queue', label: '📋 Coda' },
    { id: 'pending', label: '⏳ Approvazioni' },
    { id: 'current', label: '🎤 Corrente' },
    { id: 'songs', label: '🎵 Canzoni' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-dark-800 border-b border-dark-500 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎛️</span>
          <div>
            <h1 className="font-bold text-lg">Admin Panel</h1>
            {events.length > 0 && (
              <select
                value={selectedEventId || ''}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-transparent text-gray-400 text-sm border-none outline-none cursor-pointer"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <button onClick={() => { logout(); window.location.reload() }} className="text-gray-400 text-sm hover:text-white">
          Esci
        </button>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto bg-dark-800 border-b border-dark-500 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t.id ? 'border-brand-500 text-brand-300' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!selectedEventId && activeTab !== 'songs' ? (
          <div className="text-center py-10">
            <p className="text-gray-400">Seleziona o crea una serata</p>
            <button
              onClick={() => setActiveTab('event')}
              className="btn-primary mt-3"
            >
              Crea serata
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'event' && <EventControl eventId={selectedEventId} onEventCreated={(id) => { setSelectedEventId(id); loadEvents() }} />}
            {activeTab === 'queue' && selectedEventId && <QueuePanel eventId={selectedEventId} />}
            {activeTab === 'pending' && selectedEventId && <PendingApprovals eventId={selectedEventId} />}
            {activeTab === 'current' && selectedEventId && <CurrentPerformancePanel eventId={selectedEventId} />}
            {activeTab === 'songs' && <SongManager />}
          </>
        )}
      </div>
    </div>
  )
}
