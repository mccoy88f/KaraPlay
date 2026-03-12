import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireAdmin } from '../middleware/admin'

export default async function bookingRoutes(fastify: FastifyInstance) {
  // GET /api/events/:eventId/queue
  fastify.get('/events/:eventId/queue', async (request) => {
    const { eventId } = request.params as { eventId: string }
    const bookings = await prisma.booking.findMany({
      where: {
        eventId,
        status: { in: ['APPROVED', 'READY', 'PERFORMING', 'PROCESSING'] },
      },
      include: {
        user: { select: { id: true, nickname: true } },
        song: true,
      },
      orderBy: { position: 'asc' },
    })
    return bookings
  })

  // POST /api/events/:eventId/bookings — book a song
  fastify.post('/events/:eventId/bookings', { preHandler: authenticate }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const payload = request.user as { userId: string }

    const schema = z.object({
      songId: z.string().optional(),
      ytUrl: z.string().url().optional(),
      ytTitle: z.string().optional(),
    })
    const body = schema.parse(request.body)

    if (!body.songId && !body.ytUrl) {
      return reply.code(400).send({ error: 'songId or ytUrl is required' })
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event || event.status === 'ENDED') {
      return reply.code(400).send({ error: 'Event not available for bookings' })
    }

    const lastBooking = await prisma.booking.findFirst({
      where: { eventId, status: { not: 'REJECTED' } },
      orderBy: { position: 'desc' },
    })
    const position = (lastBooking?.position ?? 0) + 1

    const booking = await prisma.booking.create({
      data: {
        eventId,
        userId: payload.userId,
        songId: body.songId,
        ytUrl: body.ytUrl,
        ytTitle: body.ytTitle,
        position,
        status: body.ytUrl ? 'PENDING' : 'APPROVED',
      },
      include: { user: { select: { id: true, nickname: true } }, song: true },
    })

    const io = (fastify as any).io
    const queue = await getQueue(eventId)
    io.to(`event:${eventId}`).emit('queue:update', { queue })

    return booking
  })

  // GET /api/users/me/bookings
  fastify.get('/users/me/bookings', { preHandler: authenticate }, async (request) => {
    const payload = request.user as { userId: string; eventId?: string }
    return prisma.booking.findMany({
      where: { userId: payload.userId, ...(payload.eventId && { eventId: payload.eventId }) },
      include: { song: true, event: true },
      orderBy: { createdAt: 'desc' },
    })
  })

  // PUT /api/admin/bookings/:id/approve
  fastify.put('/admin/bookings/:id/approve', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'APPROVED' },
      include: { user: { select: { id: true, nickname: true } }, song: true },
    })
    const io = (fastify as any).io
    const queue = await getQueue(booking.eventId)
    io.to(`event:${booking.eventId}`).emit('queue:update', { queue })
    return booking
  })

  // PUT /api/admin/bookings/:id/reject
  fastify.put('/admin/bookings/:id/reject', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ adminNote: z.string().optional() })
    const body = schema.parse(request.body)
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'REJECTED', adminNote: body.adminNote },
    })
    const io = (fastify as any).io
    const queue = await getQueue(booking.eventId)
    io.to(`event:${booking.eventId}`).emit('queue:update', { queue })
    return booking
  })

  // PUT /api/admin/bookings/:id/position — reorder
  fastify.put('/admin/bookings/:id/position', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ position: z.number().int().positive() })
    const { position } = schema.parse(request.body)
    const booking = await prisma.booking.update({ where: { id }, data: { position } })
    const io = (fastify as any).io
    const queue = await getQueue(booking.eventId)
    io.to(`event:${booking.eventId}`).emit('queue:update', { queue })
    return booking
  })

  // PUT /api/admin/bookings/:id/skip
  fastify.put('/admin/bookings/:id/skip', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string }
    const booking = await prisma.booking.update({ where: { id }, data: { status: 'SKIPPED' } })
    const io = (fastify as any).io
    const queue = await getQueue(booking.eventId)
    io.to(`event:${booking.eventId}`).emit('queue:update', { queue })
    return booking
  })

  // GET /api/admin/bookings/pending — pending YouTube approvals
  fastify.get('/admin/bookings/pending', { preHandler: requireAdmin }, async () => {
    return prisma.booking.findMany({
      where: { status: 'PENDING', ytUrl: { not: null } },
      include: { user: { select: { id: true, nickname: true } }, event: true },
      orderBy: { createdAt: 'asc' },
    })
  })
}

async function getQueue(eventId: string) {
  return prisma.booking.findMany({
    where: { eventId, status: { in: ['APPROVED', 'READY', 'PERFORMING', 'PROCESSING'] } },
    include: { user: { select: { id: true, nickname: true } }, song: true },
    orderBy: { position: 'asc' },
  })
}
