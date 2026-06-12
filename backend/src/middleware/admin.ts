import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { JwtPayload } from "../types/jwt.js";

/** Pannello host: serve un token ottenuto da POST /api/admin/auth/login. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Accesso richiesto: fai login dal pannello host" });
  }
  const jwt = request.user as JwtPayload;
  if (jwt.role !== "admin" && jwt.role !== "superadmin") {
    return reply.code(403).send({ error: "Riservato all'host della serata" });
  }
}

/** Impostazioni del server (catalogo, soundfont, utenti): solo super admin. */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Accesso richiesto: fai login dal pannello host" });
  }
  const jwt = request.user as JwtPayload;
  if (jwt.role !== "superadmin") {
    return reply.code(403).send({ error: "Riservato al super admin" });
  }
}

/** Un admin gestisce solo le proprie serate; il super admin tutte. */
export async function canManageEvent(jwt: JwtPayload, eventId: string): Promise<boolean> {
  if (jwt.role === "superadmin") return true;
  if (jwt.role !== "admin") return false;
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { adminId: true },
  });
  return ev?.adminId === jwt.sub;
}
