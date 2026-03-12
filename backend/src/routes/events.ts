import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { requireAdmin } from '../middleware/admin'
import { randomBytes } from 'crypto'

export default async function eventRoutes(fastify: FastifyInstance) {
  // GET /api/events/:joinCode — public event info
  fastify.get('/events/:joinCode', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string }
    const event = await prisma.event.findUnique({
      where: { joinCode },
      select: { id: true, name: true, location: true, date: true, status: true, joinCode: true },
    })
    if (!event) return reply.code(404).send({ error: 'Event not found' })
    return event
  })

  // POST /api/admin/events — create event
  fastify.post('/admin/events', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      location: z.string().min(1),
      date: z.string(),
      hostId: z.string().optional(),
    })
    const body = schema.parse(request.body)

    const joinCode = randomBytes(3).toString('hex').toUpperCase() // 6-char hex

    const event = await prisma.event.create({
      data: {
        name: body.name,
        location: body.location,
        date: new Date(body.date),
        joinCode,
        hostId: body.hostId || 'admin',
      },
    })
    return event
  })

  // PUT /api/admin/events/:id — update event
  fastify.put('/admin/events/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      name: z.string().optional(),
      location: z.string().optional(),
      date: z.string().optional(),
    })
    const body = schema.parse(request.body)

    const event = await prisma.event.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.location && { location: body.location }),
        ...(body.date && { date: new Date(body.date) }),
      },
    })
    return event
  })

  // PUT /api/admin/events/:id/status — change event status
  fastify.put('/admin/events/:id/status', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ status: z.enum(['DRAFT', 'OPEN', 'LIVE', 'ENDED']) })
    const { status } = schema.parse(request.body)

    const event = await prisma.event.update({ where: { id }, data: { status } })

    const io = (fastify as any).io
    io.to(`event:${id}`).emit('event:status', { status })

    return event
  })

  // GET /api/admin/events — list all events
  fastify.get('/admin/events', { preHandler: requireAdmin }, async () => {
    return prisma.event.findMany({ orderBy: { date: 'desc' } })
  })
}
