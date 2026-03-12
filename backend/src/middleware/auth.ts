import { FastifyRequest, FastifyReply } from 'fastify'

export interface JwtPayload {
  userId: string
  nickname: string
  eventId?: string
  role: 'guest' | 'user' | 'admin'
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function authenticateOptional(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    // Optional auth — ignore errors
  }
}
