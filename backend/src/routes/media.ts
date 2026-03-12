import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs'

export default async function mediaRoutes(fastify: FastifyInstance) {
  // GET /api/media/yt/:bookingId — stream YouTube audio
  fastify.get('/media/yt/:bookingId', async (request, reply) => {
    const { bookingId } = request.params as { bookingId: string }
    const storagePath = process.env.STORAGE_PATH || path.join(__dirname, '../../storage')
    const filePath = path.join(storagePath, 'yt', `${bookingId}.opus`)

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Audio not found' })
    }

    const stat = fs.statSync(filePath)
    const range = request.headers.range

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const chunkSize = end - start + 1

      reply.code(206).headers({
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/ogg; codecs=opus',
      })

      return reply.send(fs.createReadStream(filePath, { start, end }))
    }

    reply.headers({
      'Content-Length': stat.size,
      'Content-Type': 'audio/ogg; codecs=opus',
      'Accept-Ranges': 'bytes',
    })

    return reply.send(fs.createReadStream(filePath))
  })

  // GET /api/media/midi/:songId — serve MIDI file
  fastify.get('/media/midi/:songId', async (request, reply) => {
    const { songId } = request.params as { songId: string }
    const { prisma } = await import('../index')
    const song = await prisma.song.findUnique({ where: { id: songId } })
    if (!song?.midiPath) return reply.code(404).send({ error: 'MIDI not found' })

    const storagePath = process.env.STORAGE_PATH || path.join(__dirname, '../../storage')
    const filePath = path.join(storagePath, song.midiPath)

    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' })

    reply.headers({ 'Content-Type': 'audio/midi' })
    return reply.send(fs.createReadStream(filePath))
  })

  // GET /api/media/lrc/:songId — serve LRC file
  fastify.get('/media/lrc/:songId', async (request, reply) => {
    const { songId } = request.params as { songId: string }
    const { prisma } = await import('../index')
    const song = await prisma.song.findUnique({ where: { id: songId } })
    if (!song?.lrcPath) return reply.code(404).send({ error: 'LRC not found' })

    const storagePath = process.env.STORAGE_PATH || path.join(__dirname, '../../storage')
    const filePath = path.join(storagePath, song.lrcPath)

    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' })

    reply.headers({ 'Content-Type': 'text/plain; charset=utf-8' })
    return reply.send(fs.createReadStream(filePath))
  })
}
