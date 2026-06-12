import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/admin.js";
import type { JwtPayload } from "../types/jwt.js";

const loginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

const createUserSchema = z.object({
  username: z.string().min(2).max(60).regex(/^[a-zA-Z0-9._-]+$/, "Solo lettere, numeri e ._-"),
  password: z.string().min(6).max(200),
});

export async function registerAdminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/admin/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dati non validi" });
    }
    const { username, password } = parsed.data;
    const user = await prisma.adminUser.findUnique({ where: { username: username.trim() } });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return reply.code(401).send({ error: "Utente o password errati" });
    }
    const payload: JwtPayload = {
      sub: user.id,
      nickname: user.username,
      eventId: "",
      role: user.role === "SUPERADMIN" ? "superadmin" : "admin",
    };
    const token = fastify.jwt.sign(payload);
    return reply.send({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });

  /** Verifica del token al caricamento del pannello (l'utente potrebbe essere stato eliminato). */
  fastify.get("/admin/auth/me", { preHandler: [requireAdmin] }, async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const user = await prisma.adminUser.findUnique({
      where: { id: jwt.sub },
      select: { id: true, username: true, role: true },
    });
    if (!user) {
      return reply.code(401).send({ error: "Account non più esistente" });
    }
    return reply.send({ user });
  });

  fastify.post("/admin/auth/change-password", { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Nuova password troppo corta (min 6 caratteri)" });
    }
    const jwt = request.user as JwtPayload;
    const user = await prisma.adminUser.findUnique({ where: { id: jwt.sub } });
    if (!user || !bcrypt.compareSync(parsed.data.currentPassword, user.passwordHash)) {
      return reply.code(401).send({ error: "Password attuale errata" });
    }
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(parsed.data.newPassword, 10) },
    });
    return reply.send({ ok: true });
  });

  /** Gestione degli admin (solo super admin). */
  fastify.get("/admin/users", { preHandler: [requireSuperAdmin] }, async (_request, reply) => {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        _count: { select: { events: true } },
      },
    });
    return reply.send({ users });
  });

  fastify.post("/admin/users", { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues[0]?.message ?? "Dati non validi (password min 6 caratteri)",
      });
    }
    const username = parsed.data.username.trim();
    const exists = await prisma.adminUser.findUnique({ where: { username } });
    if (exists) {
      return reply.code(409).send({ error: "Nome utente già in uso" });
    }
    const user = await prisma.adminUser.create({
      data: {
        username,
        passwordHash: bcrypt.hashSync(parsed.data.password, 10),
        role: "ADMIN",
      },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    return reply.code(201).send({ user });
  });

  fastify.delete<{ Params: { id: string } }>(
    "/admin/users/:id",
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      if (request.params.id === jwt.sub) {
        return reply.code(400).send({ error: "Non puoi eliminare il tuo account" });
      }
      const user = await prisma.adminUser.findUnique({ where: { id: request.params.id } });
      if (!user) {
        return reply.code(404).send({ error: "Utente non trovato" });
      }
      if (user.role === "SUPERADMIN") {
        return reply.code(400).send({ error: "Non puoi eliminare un super admin" });
      }
      // Le sue serate restano (adminId → null) e diventano gestibili dal super admin.
      await prisma.adminUser.delete({ where: { id: user.id } });
      return reply.send({ ok: true });
    }
  );
}
