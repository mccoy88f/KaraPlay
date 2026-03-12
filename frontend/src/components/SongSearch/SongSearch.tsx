import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../api/client'
import { Song } from '../../store/useStore'

interface Props {
  onSelect: (song: Song) => void
  onYouTube: (url: string, title: string, duration: number) => void
}

export default function SongSearch({ onSelect, onYouTube }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [ytUrl, setYtUrl] = useState('')
  const [ytPreview, setYtPreview] = useState<{ title: string; duration: number } | null>(null)
  const [ytLoading, setYtLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'catalog' | 'youtube'>('catalog')

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await api.get(`/songs?q=${encodeURIComponent(q)}`)
      setResults(res.data.songs)
    } finally {
      setLoading(false)
    }
  }, [])

  const previewYt = async () => {
    if (!ytUrl.trim()) return
    setYtLoading(true)
    try {
      const res = await api.post('/youtube/preview', { url: ytUrl })
      setYtPreview(res.data)
    } catch {
      alert('URL non valido o video non accessibile')
    } finally {
      setYtLoading(false)
    }
  }

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-dark-600 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'catalog' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          🎵 Catalogo MIDI
        </button>
        <button
          onClick={() => setActiveTab('youtube')}
          className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'youtube' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          🎬 YouTube
        </button>
      </div>

      {activeTab === 'catalog' && (
        <>
          <input
            className="input"
            placeholder="Cerca canzone o artista..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value) }}
          />
          <AnimatePresence>
            {loading && <div className="text-center text-gray-400 text-sm">Ricerca...</div>}
            {results.map((song) => (
              <motion.div
                key={song.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 p-3 bg-dark-600 rounded-lg cursor-pointer hover:bg-dark-500 transition-colors"
                onClick={() => onSelect(song)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{song.title}</p>
                  <p className="text-gray-400 text-sm truncate">{song.artist}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {song.duration && <span className="text-gray-500 text-xs">{formatDuration(song.duration)}</span>}
                  <span className="badge-midi">MIDI</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {query && results.length === 0 && !loading && (
            <p className="text-gray-500 text-sm text-center">Nessun risultato</p>
          )}
        </>
      )}

      {activeTab === 'youtube' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="URL YouTube..."
              value={ytUrl}
              onChange={(e) => { setYtUrl(e.target.value); setYtPreview(null) }}
            />
            <button onClick={previewYt} disabled={ytLoading} className="btn-secondary px-3 shrink-0">
              {ytLoading ? '...' : '🔍'}
            </button>
          </div>
          {ytPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3 bg-dark-600 rounded-lg"
            >
              <p className="font-medium">{ytPreview.title}</p>
              <p className="text-gray-400 text-sm">Durata: {formatDuration(ytPreview.duration)}</p>
              <p className="text-yellow-400 text-xs mt-1">⚠️ Richiede approvazione admin</p>
              <button
                onClick={() => onYouTube(ytUrl, ytPreview.title, ytPreview.duration)}
                className="btn-primary w-full mt-2 text-sm"
              >
                Prenota YouTube
              </button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
