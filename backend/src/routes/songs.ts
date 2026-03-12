import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { requireAdmin } from '../middleware/admin'
import path from 'path'
import fs from 'fs'

export default async function songRoutes(fastify: FastifyInstance) {
  // GET /api/songs?q= — search MIDI catalog
  fastify.get('/songs', async (request) => {
    const { q, limit = '20', offset = '0' } = request.query as { q?: string; limit?: string; offset?: string }

    const where = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { artist: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { title: 'asc' },
      }),
      prisma.song.count({ where }),
    ])

    return { songs, total }
  })

  // GET /api/songs/:id — song detail
  fastify.get('/songs/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const song = await prisma.song.findUnique({ where: { id } })
    if (!song) return reply.code(404).send({ error: 'Song not found' })
    return song
  })

  // POST /api/admin/songs — upload MIDI + optional LRC
  fastify.post('/admin/songs', { preHandler: requireAdmin }, async (request, reply) => {
    const parts = request.parts()
    let title = ''
    let artist = ''
    let language = ''
    let tags: string[] = []
    let midiPath: string | undefined
    let lrcPath: string | undefined
    let duration: number | undefined

    const storageBase = process.env.STORAGE_PATH || path.join(__dirname, '../../storage')

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'title') title = part.value as string
        if (part.fieldname === 'artist') artist = part.value as string
        if (part.fieldname === 'language') language = part.value as string
        if (part.fieldname === 'tags') {
          try { tags = JSON.parse(part.value as string) } catch { tags = [] }
        }
        if (part.fieldname === 'duration') duration = parseInt(part.value as string)
      } else {
        const filename = `${Date.now()}_${part.filename}`
        const ext = path.extname(part.filename || '').toLowerCase()
        let dir = ''

        if (ext === '.mid' || ext === '.midi') {
          dir = path.join(storageBase, 'midi')
          fs.mkdirSync(dir, { recursive: true })
          midiPath = `midi/${filename}`
        } else if (ext === '.lrc') {
          dir = path.join(storageBase, 'lrc')
          fs.mkdirSync(dir, { recursive: true })
          lrcPath = `lrc/${filename}`
        }

        if (dir) {
          const writeStream = fs.createWriteStream(path.join(dir, filename))
          await new Promise((resolve, reject) => {
            part.file.pipe(writeStream)
            part.file.on('end', resolve)
            part.file.on('error', reject)
          })
        }
      }
    }

    if (!title || !artist) return reply.code(400).send({ error: 'title and artist are required' })
    if (!midiPath) return reply.code(400).send({ error: 'MIDI file is required' })

    const song = await prisma.song.create({
      data: { title, artist, source: 'MIDI', midiPath, lrcPath, duration, language, tags },
    })
    return song
  })

  // DELETE /api/admin/songs/:id
  fastify.delete('/admin/songs/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.song.delete({ where: { id } })
    return { message: 'Song deleted' }
  })
}
