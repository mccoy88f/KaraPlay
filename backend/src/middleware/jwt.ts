import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Token non valido" });
  }
}
