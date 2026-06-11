import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireJwt } from "../middleware/jwt.js";
import type { JwtPayload } from "../types/jwt.js";
import { getQueueForEvent } from "../lib/queue.js";
import { emitQueueUpdate } from "../socket/emit.js";

const createBookingSchema = z
  .object({
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
  );

export async function registerBookingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { eventId: string } }>("/events/:eventId/queue", async (request, reply) => {
    const { eventId } = request.params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, soundfontBankId: true },
    });
    if (!event) {
      return reply.code(404).send({ error: "Serata non trovata" });
    }
    const queue = await getQueueForEvent(eventId);
    return reply.send({ queue, soundfontBankId: event.soundfontBankId });
  });

  /** Esibizione in corso (per il display dopo F5: il socket non rimanda performance:start). */
  fastify.get<{ Params: { eventId: string } }>("/events/:eventId/live", async (request, reply) => {
    const { eventId } = request.params;
    const exists = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!exists) {
      return reply.code(404).send({ error: "Serata non trovata" });
    }
    const booking = await prisma.booking.findFirst({
      where: { eventId, status: "PERFORMING" },
      include: {
        song: true,
        user: { select: { id: true, nickname: true } },
        performance: true,
      },
    });
    if (!booking?.performance || !booking.song) {
      return reply.send({ live: null });
    }
    const s = booking.song;
    return reply.send({
      live: {
        performance: { id: booking.performance.id },
        booking: { id: booking.id },
        song: {
          id: s.id,
          title: s.title,
          artist: s.artist,
          source: s.source,
          midiPath: s.midiPath,
          lrcPath: s.lrcPath,
        },
        user: { nickname: booking.user.nickname },
      },
    });
  });

  fastify.post<{ Params: { eventId: string } }>(
    "/events/:eventId/bookings",
    { preHandler: [requireJwt] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const { eventId } = request.params;
      if (jwt.eventId !== eventId) {
        return reply.code(403).send({ error: "Token non valido per questa serata" });
      }

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({
          error:
            "Serata non trovata. Esci e rientra con il PIN aggiornato (evento o database potrebbero essere cambiati).",
        });
      }
      if (event.status !== "OPEN" && event.status !== "LIVE") {
        return reply.code(403).send({
          error: `Prenotazioni chiuse: la serata è in stato «${event.status}». L'host deve impostarla su APERTA o LIVE dal pannello admin.`,
        });
      }

      const parsed = createBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const body = parsed.data;
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
            userId: jwt.sub,
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
          userId: jwt.sub,
          songId: null,
          ytUrl: body.ytUrl,
          ytTitle: body.ytTitle ?? null,
          position,
          status: "PENDING",
        },
        include: {
          user: { select: { id: true, nickname: true } },
          song: true,
        },
      });
      await emitQueueUpdate(eventId);
      return reply.code(201).send(booking);
    }
  );

  fastify.get("/users/me/bookings", { preHandler: [requireJwt] }, async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const bookings = await prisma.booking.findMany({
      where: { userId: jwt.sub, eventId: jwt.eventId },
      orderBy: { createdAt: "desc" },
      include: { song: true, event: { select: { id: true, name: true, joinCode: true } } },
    });
    return reply.send({ bookings });
  });
}
