const BASE = 'https://lrclib.net/api'

export const lrclibService = {
  async getLrc(title: string, artist: string, duration?: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({ track_name: title, artist_name: artist })
      if (duration) params.set('duration', String(duration))

      const res = await fetch(`${BASE}/get?${params}`)
      if (!res.ok) return null

      const data = await res.json() as { syncedLyrics?: string; plainLyrics?: string }
      return data.syncedLyrics || data.plainLyrics || null
    } catch {
      return null
    }
  },

  async search(query: string): Promise<Array<{ id: number; title: string; artistName: string; syncedLyrics?: string }>> {
    try {
      const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) return []
      return await res.json() as Array<{ id: number; title: string; artistName: string; syncedLyrics?: string }>
    } catch {
      return []
    }
  },
}
