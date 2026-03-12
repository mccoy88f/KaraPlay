import { useState, useEffect } from 'react'
import api from '../../../api/client'
import toast from 'react-hot-toast'

interface Props { eventId: string }

export default function PendingApprovals({ eventId }: Props) {
  const [pending, setPending] = useState<any[]>([])

  useEffect(() => { load() }, [eventId])

  const load = async () => {
    const res = await api.get('/admin/bookings/pending')
    setPending(res.data.filter((b: any) => b.eventId === eventId))
  }

  const approve = async (id: string) => {
    try {
      await api.put(`/admin/bookings/${id}/approve`)
      await api.post(`/admin/youtube/process/${id}`)
      toast.success('Approvato! Download avviato.')
      load()
    } catch {
      toast.error('Errore')
    }
  }

  const reject = async (id: string) => {
    await api.put(`/admin/bookings/${id}/reject`)
    toast.success('Rifiutato')
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">⏳ Approvazioni YouTube ({pending.length})</h2>
        <button onClick={load} className="text-gray-400 text-sm hover:text-white">↻</button>
      </div>

      {pending.map((b) => (
        <div key={b.id} className="card space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{b.ytTitle || 'Titolo non disponibile'}</p>
              <p className="text-gray-400 text-sm">👤 {b.user.nickname}</p>
              <a href={b.ytUrl} target="_blank" rel="noreferrer" className="text-brand-400 text-xs truncate block max-w-[200px] hover:underline">
                {b.ytUrl}
              </a>
            </div>
            <span className="badge-youtube">YouTube</span>
          </div>

          <div className="flex gap-2">
            <button onClick={() => approve(b.id)} className="btn-primary flex-1 text-sm">
              ✅ Approva
            </button>
            <button onClick={() => reject(b.id)} className="btn-secondary flex-1 text-sm border-red-500/30 text-red-300 hover:bg-red-500/10">
              ❌ Rifiuta
            </button>
          </div>
        </div>
      ))}

      {pending.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          <p>Nessuna approvazione in attesa</p>
        </div>
      )}
    </div>
  )
}
