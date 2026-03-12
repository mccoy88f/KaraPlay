import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../index'
import { otpService } from '../services/otp.service'
import { mailService } from '../services/mail.service'
import { randomBytes } from 'crypto'

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/join — anonymous join with nickname + event joinCode
  fastify.post('/join', async (request, reply) => {
    const schema = z.object({
      nickname: z.string().min(1).max(30),
      joinCode: z.string().min(1),
    })
    const body = schema.parse(request.body)

    const event = await prisma.event.findUnique({ where: { joinCode: body.joinCode } })
    if (!event) return reply.code(404).send({ error: 'Event not found' })
    if (event.status === 'ENDED') return reply.code(400).send({ error: 'Event has ended' })
    if (event.status === 'DRAFT') return reply.code(400).send({ error: 'Event not open yet' })

    const sessionToken = randomBytes(32).toString('hex')
    const user = await prisma.user.create({
      data: {
        nickname: body.nickname,
        sessionToken,
      },
    })

    const token = fastify.jwt.sign({
      userId: user.id,
      nickname: user.nickname,
      eventId: event.id,
      role: 'guest',
    })

    return { token, user: { id: user.id, nickname: user.nickname }, event: { id: event.id, name: event.name } }
  })

  // POST /api/auth/request-otp — send OTP to email
  fastify.post('/request-otp', async (request, reply) => {
    const schema = z.object({ email: z.string().email() })
    const { email } = schema.parse(request.body)

    const code = otpService.generate()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await prisma.otpCode.create({ data: { email, code, expiresAt } })

    await mailService.sendOtp(email, code)

    return { message: 'OTP sent' }
  })

  // POST /api/auth/verify-otp — verify OTP and link to account
  fastify.post('/verify-otp', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().length(6),
      currentToken: z.string().optional(),
    })
    const body = schema.parse(request.body)

    const otp = await prisma.otpCode.findFirst({
      where: { email: body.email, code: body.code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!otp) return reply.code(400).send({ error: 'Invalid or expired OTP' })

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })

    // Find or create permanent user account
    let user = await prisma.user.findUnique({ where: { email: body.email } })

    if (!user) {
      // Link current guest session to new account
      if (body.currentToken) {
        try {
          const payload = fastify.jwt.verify(body.currentToken) as { userId: string; nickname: string }
          user = await prisma.user.update({
            where: { id: payload.userId },
            data: { email: body.email, emailVerified: true },
          })
        } catch {
          user = await prisma.user.create({
            data: { nickname: 'User', email: body.email, emailVerified: true },
          })
        }
      } else {
        user = await prisma.user.create({
          data: { nickname: 'User', email: body.email, emailVerified: true },
        })
      }
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    }

    const token = fastify.jwt.sign({ userId: user.id, nickname: user.nickname, role: 'user' })
    return { token, user: { id: user.id, nickname: user.nickname, email: user.email } }
  })

  // POST /api/auth/link-phone
  fastify.post('/link-phone', async (request, reply) => {
    const schema = z.object({ phone: z.string(), marketingOk: z.boolean() })
    const body = schema.parse(request.body)

    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    const payload = request.user as { userId: string }

    await prisma.user.update({
      where: { id: payload.userId },
      data: { phone: body.phone, marketingOk: body.marketingOk },
    })

    return { message: 'Phone linked' }
  })
}
