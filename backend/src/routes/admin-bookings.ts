import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canManageEvent, requireAdmin } from "../middleware/admin.js";
import type { JwtPayload } from "../types/jwt.js";
import { emitQueueUpdate } from "../socket/emit.js";
import { maybeAutoDownloadYoutube } from "../services/youtube-process.service.js";

const adminCreateBookingSchema = z
  .object({
    userId: z.string().cuid().optional(),
    nickname: z.string().min(1).max(40).optional(),
    songId: z.string().cuid().optional(),
    ytUrl: z.string().url().optional(),
    ytTitle: z.string().max(300).optional(),
  })
  .refine(
    (b) => {
      const hasSong = b.songId !== undefined;
      const hasYt = b.ytUrl !== undefined;
      return hasSong !== hasYt;
    },
    { message: "Specifica songId (MIDI) oppure ytUrl (YouTube), non entrambi" }
  )
  .refine((b) => Boolean(b.userId?.trim() || b.nickname?.trim()), {
    message: "Specifica a chi assegnare (partecipante o nickname)",
  });

async function resolveAssigneeUserId(
  eventId: string,
  userId: string | undefined,
  nickname: string | undefined
): Promise<string | null> {
  if (userId?.trim()) {
    const u = await prisma.user.findUnique({ where: { id: userId.trim() }, select: { id: true } });
    return u?.id ?? null;
  }
  const nick = nickname?.trim();
  if (!nick) return null;
  const recent = await prisma.booking.findFirst({
    where: { eventId, user: { nickname: nick } },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
  });
  if (recent) return recent.userId;
  const created = await prisma.user.create({ data: { nickname: nick } });
  return created.id;
}

export async function registerAdminBookingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { eventId: string } }>(
    "/admin/events/:eventId/participants",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { eventId } = request.params;
      if (!(await canManageEvent(request.user as JwtPayload, eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      const bookings = await prisma.booking.findMany({
        where: { eventId },
        select: { user: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: "desc" },
      });
      const byId = new Map<string, { id: string; nickname: string }>();
      for (const b of bookings) byId.set(b.user.id, b.user);
      const participants = [...byId.values()].sort((a, b) =>
        a.nickname.localeCompare(b.nickname, "it", { sensitivity: "base" })
      );
      return reply.send({ participants });
    }
  );

  fastify.post<{ Params: { eventId: string } }>(
    "/admin/events/:eventId/bookings",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { eventId } = request.params;
      if (!(await canManageEvent(request.user as JwtPayload, eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: "Serata non trovata" });
      }
      if (event.status === "ENDED") {
        return reply.code(403).send({
          error: "Serata conclusa: non si possono aggiungere prenotazioni.",
        });
      }

      const parsed = adminCreateBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const body = parsed.data;
      const assigneeId = await resolveAssigneeUserId(eventId, body.userId, body.nickname);
      if (!assigneeId) {
        return reply.code(400).send({ error: "Partecipante non valido" });
      }

      const last = await prisma.booking.findFirst({
        where: { eventId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const position = (last?.position ?? 0) + 1;

      if (body.songId) {
        const song = await prisma.song.findUnique({ where: { id: body.songId } });
        if (!song) {
          return reply.code(404).send({ error: "Canzone non trovata" });
        }
        const booking = await prisma.booking.create({
          data: {
            eventId,
            userId: assigneeId,
            songId: song.id,
            position,
            status: "APPROVED",
          },
          include: {
            user: { select: { id: true, nickname: true } },
            song: true,
          },
        });
        await emitQueueUpdate(eventId);
        return reply.code(201).send(booking);
      }

      const booking = await prisma.booking.create({
        data: {
          eventId,
          userId: assigneeId,
          songId: null,
          ytUrl: body.ytUrl,
          ytTitle: body.ytTitle ?? null,
          position,
          status: "APPROVED",
        },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(eventId);
      if (body.ytUrl) void maybeAutoDownloadYoutube(eventId, booking.id);
      return reply.code(201).send(booking);
    }
  );

  /** Rinomina il titolo mostrato per una prenotazione video (e la Song scaricata, se c'è). */
  fastify.put<{ Params: { id: string }; Body: { ytTitle?: string } }>(
    "/admin/bookings/:id/title",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const title = String((request.body as { ytTitle?: string })?.ytTitle ?? "").trim();
      if (!title || title.length > 300) {
        return reply.code(400).send({ error: "Titolo non valido (1-300 caratteri)" });
      }
      const booking = await prisma.booking.findUnique({
        where: { id: request.params.id },
        include: { song: { select: { id: true, source: true } } },
      });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (!booking.ytUrl) {
        return reply.code(400).send({ error: "Si rinominano solo le prenotazioni video" });
      }
      await prisma.booking.update({ where: { id: booking.id }, data: { ytTitle: title } });
      if (booking.song && booking.song.source === "YOUTUBE") {
        await prisma.song.update({ where: { id: booking.song.id }, data: { title } });
      }
      await emitQueueUpdate(booking.eventId);
      return reply.send({ ok: true });
    }
  );

  /** Bis: duplica una prenotazione già conclusa in fondo alla scaletta. */
  fastify.post<{ Params: { id: string } }>(
    "/admin/bookings/:id/replay",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (booking.status !== "DONE" && booking.status !== "SKIPPED") {
        return reply.code(400).send({ error: "Si può ripetere solo un brano già concluso" });
      }
      const last = await prisma.booking.findFirst({
        where: { eventId: booking.eventId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await prisma.booking.create({
        data: {
          eventId: booking.eventId,
          userId: booking.userId,
          songId: booking.songId,
          ytUrl: booking.ytUrl,
          ytTitle: booking.ytTitle,
          position: (last?.position ?? 0) + 1,
          // video YouTube già scaricato (Song presente): riparte subito senza pubblicità
          status: booking.songId && booking.ytUrl ? "READY" : "APPROVED",
        },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(booking.eventId);
      if (created.status === "APPROVED" && created.ytUrl) {
        void maybeAutoDownloadYoutube(booking.eventId, created.id);
      }
      return reply.code(201).send(created);
    }
  );

  fastify.put<{ Params: { id: string } }>(
    "/admin/bookings/:id/approve",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (booking.status !== "PENDING") {
        return reply.code(400).send({ error: "Solo prenotazioni PENDING possono essere approvate" });
      }
      if (!booking.ytUrl) {
        return reply.code(400).send({ error: "Approvazione YouTube: manca l'URL" });
      }
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "APPROVED" },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(booking.eventId);
      void maybeAutoDownloadYoutube(booking.eventId, updated.id);
      return reply.send(updated);
    }
  );

  fastify.put<{ Params: { id: string } }>(
    "/admin/bookings/:id/reject",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      if (booking.status !== "PENDING") {
        return reply.code(400).send({ error: "Solo prenotazioni PENDING possono essere rifiutate" });
      }
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "REJECTED" },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(booking.eventId);
      return reply.send(updated);
    }
  );
}
