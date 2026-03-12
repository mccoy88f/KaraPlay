import { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  // Check Bearer token against ADMIN_TOKEN env
  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === process.env.ADMIN_TOKEN) return
  }

  // Or check JWT role
  try {
    await request.jwtVerify()
    const user = request.user as { role: string }
    if (user.role === 'admin') return
  } catch {
    // fall through
  }

  reply.code(403).send({ error: 'Forbidden: admin access required' })
}
