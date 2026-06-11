import { useState, useEffect } from 'react'
import api from '../../../api/client'
import toast from 'react-hot-toast'

export default function SongManager() {
  const [songs, setSongs] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ title: '', artist: '', language: '', duration: '' })
  const [midiFile, setMidiFile] = useState<File | null>(null)
  const [lrcFile, setLrcFile] = useState<File | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadSongs()
  }, [search])

  const loadSongs = async () => {
    const res = await api.get(`/songs${search ? `?q=${encodeURIComponent(search)}` : ''}`)
    setSongs(res.data.songs)
  }

  const uploadSong = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!midiFile) { toast.error('File MIDI obbligatorio'); return }

    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('artist', form.artist)
    fd.append('language', form.language)
    fd.append('duration', form.duration)
    fd.append('midi', midiFile)
    if (lrcFile) fd.append('lrc', lrcFile)

    setUploading(true)
    try {
      await api.post('/admin/songs', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Canzone aggiunta!')
      setShowForm(false)
      setForm({ title: '', artist: '', language: '', duration: '' })
      setMidiFile(null)
      setLrcFile(null)
      loadSongs()
    } catch {
      toast.error('Errore upload')
    } finally {
      setUploading(false)
    }
  }

  const deleteSong = async (id: string) => {
    if (!confirm('Eliminare questa canzone?')) return
    await api.delete(`/admin/songs/${id}`)
    toast.success('Canzone eliminata')
    loadSongs()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input className="input flex-1" placeholder="Cerca canzoni..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={() => setShowForm(!showForm)} className="btn-primary px-3 shrink-0">
          + Aggiungi
        </button>
      </div>

      {showForm && (
        <form onSubmit={uploadSong} className="card space-y-3">
          <h3 className="font-bold">Carica Canzone MIDI</h3>
          <input className="input" placeholder="Titolo *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className="input" placeholder="Artista *" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Lingua (it/en/...)" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
            <input className="input" type="number" placeholder="Durata (sec)" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">File MIDI *</label>
            <input type="file" accept=".mid,.midi" onChange={(e) => setMidiFile(e.target.files?.[0] || null)} className="text-sm text-gray-300" />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">File LRC (opzionale)</label>
            <input type="file" accept=".lrc" onChange={(e) => setLrcFile(e.target.files?.[0] || null)} className="text-sm text-gray-300" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={uploading} className="btn-primary flex-1">
              {uploading ? 'Upload...' : 'Carica'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
              Annulla
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {songs.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-3 bg-dark-700 rounded-lg border border-dark-500">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{s.title}</p>
              <p className="text-gray-400 text-sm truncate">{s.artist}</p>
            </div>
            <span className="badge-midi shrink-0">MIDI</span>
            {s.lrcPath && <span className="text-xs text-green-400 shrink-0">LRC</span>}
            <button onClick={() => deleteSong(s.id)} className="text-red-400 hover:text-red-300 text-sm shrink-0">
              🗑
            </button>
          </div>
        ))}
        {songs.length === 0 && (
          <p className="text-center text-gray-500 py-8">Nessuna canzone nel catalogo</p>
        )}
      </div>
    </div>
  )
}
