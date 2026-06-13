import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED") {
      return reply.code(401).send({ error: "Sessione scaduta: esci e rientra con PIN e nickname." });
    }
    return reply.code(401).send({ error: "Sessione scaduta: esci e rientra con PIN e nickname." });
  }
}
