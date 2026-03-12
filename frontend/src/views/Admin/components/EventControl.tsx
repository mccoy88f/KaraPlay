import { useState, useEffect } from 'react'
import api from '../../../api/client'
import toast from 'react-hot-toast'
import QRCodeWidget from '../../../components/QRCode/QRCodeWidget'

interface Props {
  eventId: string | null
  onEventCreated: (id: string) => void
}

export default function EventControl({ eventId, onEventCreated }: Props) {
  const [event, setEvent] = useState<any>(null)
  const [connectedUsers, setConnectedUsers] = useState(0)
  const [form, setForm] = useState({ name: '', location: '', date: '' })
  const [creating, setCreating] = useState(!eventId)

  useEffect(() => {
    if (eventId) loadEvent()
  }, [eventId])

  const loadEvent = async () => {
    if (!eventId) return
    // Get all events and find by id
    const res = await api.get('/admin/events')
    const ev = res.data.find((e: any) => e.id === eventId)
    setEvent(ev)
  }

  const createEvent = async () => {
    try {
      const res = await api.post('/admin/events', form)
      onEventCreated(res.data.id)
      toast.success('Serata creata! 🎉')
      setCreating(false)
    } catch {
      toast.error('Errore nella creazione')
    }
  }

  const changeStatus = async (status: string) => {
    if (!eventId) return
    try {
      await api.put(`/admin/events/${eventId}/status`, { status })
      setEvent((e: any) => ({ ...e, status }))
      toast.success(`Stato → ${status}`)
    } catch {
      toast.error('Errore')
    }
  }

  const statusColor: Record<string, string> = {
    DRAFT: 'text-gray-400',
    OPEN: 'text-blue-400',
    LIVE: 'text-green-400',
    ENDED: 'text-red-400',
  }

  const joinUrl = event ? `${window.location.origin}/join/${event.joinCode}` : ''

  return (
    <div className="space-y-4">
      {creating || !event ? (
        <div className="card space-y-3">
          <h2 className="font-bold text-lg">Crea Nuova Serata</h2>
          <input className="input" placeholder="Nome serata" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <input className="input" type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <button onClick={createEvent} disabled={!form.name || !form.location || !form.date} className="btn-primary w-full">
            Crea Serata
          </button>
        </div>
      ) : (
        <>
          <div className="card space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-xl">{event.name}</h2>
                <p className="text-gray-400">{event.location}</p>
                <p className="text-gray-500 text-sm">{new Date(event.date).toLocaleString('it-IT')}</p>
              </div>
              <span className={`font-bold text-sm ${statusColor[event.status] || 'text-gray-400'}`}>
                ● {event.status}
              </span>
            </div>

            {/* QR + PIN */}
            <div className="flex flex-col items-center gap-3 py-3 border border-dark-500 rounded-xl">
              {joinUrl && <QRCodeWidget value={joinUrl} size={150} />}
              <div className="text-center">
                <div className="text-3xl font-bold tracking-widest text-brand-300">{event.joinCode}</div>
                <p className="text-gray-500 text-xs">Codice di accesso</p>
              </div>
            </div>

            {/* Status controls */}
            <div className="grid grid-cols-2 gap-2">
              {event.status === 'DRAFT' && (
                <button onClick={() => changeStatus('OPEN')} className="btn-primary col-span-2">
                  🟢 Apri Prenotazioni
                </button>
              )}
              {event.status === 'OPEN' && (
                <button onClick={() => changeStatus('LIVE')} className="btn-primary col-span-2">
                  🔴 Inizia Serata
                </button>
              )}
              {event.status === 'LIVE' && (
                <button onClick={() => changeStatus('ENDED')} className="btn-secondary col-span-2 border-red-500/30 text-red-300 hover:bg-red-500/10">
                  ⏹ Termina Serata
                </button>
              )}
            </div>
          </div>

          <button onClick={() => setCreating(true)} className="btn-secondary w-full text-sm">
            + Crea Nuova Serata
          </button>
        </>
      )}
    </div>
  )
}
