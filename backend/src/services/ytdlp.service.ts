import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export const ytdlpService = {
  async getInfo(url: string): Promise<{ title: string; duration: number; thumbnail?: string } | null> {
    return new Promise((resolve) => {
      const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', url])
      let output = ''
      let error = ''

      proc.stdout.on('data', (data) => { output += data.toString() })
      proc.stderr.on('data', (data) => { error += data.toString() })

      proc.on('close', (code) => {
        if (code !== 0 || !output) { resolve(null); return }
        try {
          const info = JSON.parse(output)
          resolve({ title: info.title, duration: info.duration, thumbnail: info.thumbnail })
        } catch {
          resolve(null)
        }
      })
    })
  },

  async download(url: string, bookingId: string, onProgress?: (progress: number) => void): Promise<string> {
    const storagePath = process.env.STORAGE_PATH || path.join(__dirname, '../../storage')
    const ytDir = path.join(storagePath, 'yt')
    fs.mkdirSync(ytDir, { recursive: true })

    const outputTemplate = path.join(ytDir, `${bookingId}.%(ext)s`)
    const expectedOutput = path.join(ytDir, `${bookingId}.opus`)

    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', [
        '--extract-audio',
        '--audio-format', 'opus',
        '--audio-quality', '0',
        '--no-playlist',
        '--output', outputTemplate,
        '--no-warnings',
        '--newline',
        url,
      ])

      proc.stdout.on('data', (data) => {
        const text = data.toString()
        // Parse progress from yt-dlp output: [download]  42.3% of ...
        const match = text.match(/\[download\]\s+([\d.]+)%/)
        if (match && onProgress) {
          onProgress(parseFloat(match[1]))
        }
      })

      let errorOutput = ''
      proc.stderr.on('data', (data) => { errorOutput += data.toString() })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(errorOutput || 'yt-dlp failed'))
          return
        }
        resolve(expectedOutput)
      })
    })
  },
}
