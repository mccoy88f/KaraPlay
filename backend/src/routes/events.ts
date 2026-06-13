import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canManageEvent, requireAdmin } from "../middleware/admin.js";
import { isValidSoundfontBankId } from "../lib/soundfontBanks.js";
import type { EventStatus } from "@prisma/client";
import type { JwtPayload } from "../types/jwt.js";
import { cleanupEventYoutube } from "../services/youtube-process.service.js";

function randomJoinCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  date: z.string().datetime(),
  joinCode: z.string().min(4).max(32).optional(),
});

const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  location: z.string().min(1).max(200).optional(),
  date: z.string().datetime().optional(),
  soundfontBankId: z
    .string()
    .refine(isValidSoundfontBankId, "Banco sonoro non valido (gleitz o sf2:<file>)")
    .optional(),
  youtubeAutoDownload: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "ENDED"]),
});

export async function registerEventRoutes(fastify: FastifyInstance): Promise<void> {
  /** Verifica che il login admin sia valido (usato dal pannello). */
  fastify.get("/admin/ping", { preHandler: [requireAdmin] }, async () => ({ ok: true }));

  /** Info essenziali per id (il display conosce l'eventId, non il PIN). */
  fastify.get<{ Params: { id: string } }>("/events/by-id/:id", async (request, reply) => {
    const event = await prisma.event.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        name: true,
        location: true,
        date: true,
        status: true,
        joinCode: true,
        soundfontBankId: true,
        youtubeAutoDownload: true,
      },
    });
    if (!event) {
      return reply.code(404).send({ error: "Serata non trovata" });
    }
    return reply.send(event);
  });

  /** Elenco serate: l'admin vede solo le sue, il super admin tutte. */
  fastify.get("/admin/events", { preHandler: [requireAdmin] }, async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const events = await prisma.event.findMany({
      where: jwt.role === "superadmin" ? {} : { adminId: jwt.sub },
      orderBy: { date: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        location: true,
        date: true,
        status: true,
        joinCode: true,
        soundfontBankId: true,
        youtubeAutoDownload: true,
        _count: { select: { bookings: true, performances: true } },
      },
    });
    return reply.send({ events });
  });

  fastify.get<{ Params: { joinCode: string } }>("/events/:joinCode", async (request, reply) => {
    const { joinCode } = request.params;
    const event = await prisma.event.findUnique({
      where: { joinCode: joinCode.trim() },
      select: {
        id: true,
        name: true,
        location: true,
        date: true,
        status: true,
        joinCode: true,
        soundfontBankId: true,
      },
    });
    if (!event) {
      return reply.code(404).send({ error: "Serata non trovata" });
    }
    return reply.send(event);
  });

  fastify.post(
    "/admin/events",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = createEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }
      const host = await prisma.user.findFirst({
        where: { email: "host@karaoke.local" },
      });
      if (!host) {
        return reply.code(500).send({ error: "Esegui il seed: utente host mancante" });
      }
      const { name, location, date, joinCode } = parsed.data;
      let code = joinCode?.trim();
      if (!code) {
        for (let i = 0; i < 20; i++) {
          const candidate = randomJoinCode();
          const exists = await prisma.event.findUnique({ where: { joinCode: candidate } });
          if (!exists) {
            code = candidate;
            break;
          }
        }
      }
      if (!code) {
        return reply.code(500).send({ error: "Impossibile generare join code" });
      }

      const jwt = request.user as JwtPayload;
      const event = await prisma.event.create({
        data: {
          name,
          location,
          date: new Date(date),
          joinCode: code,
          hostId: host.id,
          adminId: jwt.sub,
          status: "DRAFT",
        },
      });
      return reply.code(201).send(event);
    }
  );

  fastify.put<{ Params: { id: string } }>(
    "/admin/events/:id",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      if (!(await canManageEvent(request.user as JwtPayload, request.params.id))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      const parsed = updateEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi" });
      }
      const data = parsed.data;
      const event = await prisma.event.update({
        where: { id: request.params.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
          ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
          ...(data.soundfontBankId !== undefined ? { soundfontBankId: data.soundfontBankId } : {}),
          ...(data.youtubeAutoDownload !== undefined ? { youtubeAutoDownload: data.youtubeAutoDownload } : {}),
        },
      });
      return reply.send(event);
    }
  );

  fastify.put<{ Params: { id: string } }>(
    "/admin/events/:id/status",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      if (!(await canManageEvent(request.user as JwtPayload, request.params.id))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      const parsed = statusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Stato non valido" });
      }
      const status = parsed.data.status as EventStatus;
      const event = await prisma.event.update({
        where: { id: request.params.id },
        data: { status },
      });
      if (status === "ENDED") {
        // i video YouTube scaricati sono usa-e-getta: a fine serata si liberano disco e catalogo
        try {
          const r = await cleanupEventYoutube(event.id);
          return reply.send({ ...event, youtubeCleanup: r });
        } catch (e) {
          console.error("[cleanup-youtube]", e);
        }
      }
      return reply.send(event);
    }
  );
}
