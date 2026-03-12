import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { requireAdmin } from '../middleware/admin'
import { ytdlpService } from '../services/ytdlp.service'
import { lrclibService } from '../services/lrclib.service'

export default async function youtubeRoutes(fastify: FastifyInstance) {
  // POST /api/youtube/preview — get title and duration without downloading
  fastify.post('/youtube/preview', async (request, reply) => {
    const schema = z.object({ url: z.string().url() })
    const { url } = schema.parse(request.body)

    const info = await ytdlpService.getInfo(url)
    if (!info) return reply.code(400).send({ error: 'Could not fetch video info' })

    return info
  })

  // GET /api/youtube/lrc?title=&artist=
  fastify.get('/youtube/lrc', async (request) => {
    const { title, artist, duration } = request.query as { title: string; artist: string; duration?: string }
    const lrc = await lrclibService.getLrc(title, artist, duration ? parseInt(duration) : undefined)
    return { lrc, found: !!lrc }
  })

  // POST /api/admin/youtube/process/:bookingId — start yt-dlp download
  fastify.post('/admin/youtube/process/:bookingId', { preHandler: requireAdmin }, async (request, reply) => {
    const { bookingId } = request.params as { bookingId: string }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { song: true },
    })
    if (!booking || !booking.ytUrl) return reply.code(404).send({ error: 'Booking not found or no YouTube URL' })
    if (booking.status !== 'APPROVED') return reply.code(400).send({ error: 'Booking not approved' })

    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PROCESSING' } })

    const io = (fastify as any).io
    io.to(`event:${booking.eventId}`).emit('youtube:processing', { bookingId, progress: 0 })

    // Run yt-dlp asynchronously
    ytdlpService
      .download(booking.ytUrl, bookingId, (progress) => {
        io.to(`event:${booking.eventId}`).emit('youtube:processing', { bookingId, progress })
      })
      .then(async (outputPath) => {
        // Try to get LRC
        let lrcFound = false
        if (booking.ytTitle) {
          const parts = booking.ytTitle.split(' - ')
          const artist = parts.length > 1 ? parts[0] : ''
          const title = parts.length > 1 ? parts.slice(1).join(' - ') : booking.ytTitle
          const lrc = await lrclibService.getLrc(title, artist)
          if (lrc) {
            lrcFound = true
            const lrcPath = outputPath.replace('.opus', '.lrc')
            const fs = await import('fs')
            fs.writeFileSync(lrcPath, lrc)
          }
        }

        // Create song record
        const song = await prisma.song.create({
          data: {
            title: booking.ytTitle || 'Unknown',
            artist: '',
            source: 'YOUTUBE',
            mp3Path: outputPath,
            lrcPath: lrcFound ? outputPath.replace('.opus', '.lrc') : undefined,
          },
        })

        await prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'READY', ytLrcFound: lrcFound, songId: song.id },
        })

        io.to(`event:${booking.eventId}`).emit('youtube:ready', { bookingId, lrcFound })
      })
      .catch(async (err) => {
        await prisma.booking.update({ where: { id: bookingId }, data: { status: 'APPROVED' } })
        io.to(`event:${booking.eventId}`).emit('youtube:error', { bookingId, error: err.message })
      })

    return { message: 'Processing started' }
  })

  // GET /api/admin/youtube/status/:bookingId
  fastify.get('/admin/youtube/status/:bookingId', { preHandler: requireAdmin }, async (request, reply) => {
    const { bookingId } = request.params as { bookingId: string }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) return reply.code(404).send({ error: 'Not found' })
    return { status: booking.status, ytLrcFound: booking.ytLrcFound }
  })
}
