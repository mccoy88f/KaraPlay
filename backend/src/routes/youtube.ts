import { unlink, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canManageEvent, requireAdmin } from "../middleware/admin.js";
import {
  ensureStorageLayout,
  getAdminCookiesPath,
  resolveYoutubeCookiesPath,
} from "../lib/storage.js";
import { prisma } from "../lib/prisma.js";
import type { JwtPayload } from "../types/jwt.js";
import { previewUrl, searchYoutube } from "../services/ytdlp.service.js";
import { requireJwt } from "../middleware/jwt.js";
import { fetchLrcFromLrclib } from "../services/lrclib.service.js";
import { startYoutubeProcess } from "../services/youtube-process.service.js";

const previewSchema = z.object({
  url: z.string().url(),
});

export async function registerYoutubeRoutes(fastify: FastifyInstance): Promise<void> {
  /** Ricerca brani su YouTube per il pubblico (richiede join alla serata). */
  fastify.get<{ Querystring: { q?: string; limit?: string } }>(
    "/youtube/search",
    { preHandler: [requireJwt] },
    async (request, reply) => {
      const q = request.query.q?.trim();
      if (!q || q.length < 2) {
        return reply.code(400).send({ error: "Parametro q troppo corto (min 2 caratteri)" });
      }
      const limit = request.query.limit ? Number(request.query.limit) : 8;
      const jwt = request.user as JwtPayload;
      const event = jwt.eventId
        ? await prisma.event.findUnique({ where: { id: jwt.eventId }, select: { adminId: true } })
        : null;
      try {
        const results = await searchYoutube(q, Number.isFinite(limit) ? limit : 8, event?.adminId);
        return reply.send({ results });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.code(502).send({ error: msg });
      }
    }
  );

  fastify.post("/youtube/preview", async (request, reply) => {
    const parsed = previewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "URL non valido" });
    }
    try {
      const meta = await previewUrl(parsed.data.url);
      return reply.send({
        title: meta.title,
        duration: meta.duration,
        artist: meta.artist,
        videoId: meta.id,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ error: msg });
    }
  });

  fastify.get<{ Querystring: { title?: string; artist?: string; duration?: string } }>(
    "/youtube/lrc",
    async (request, reply) => {
      const title = request.query.title?.trim();
      const artist = request.query.artist?.trim();
      if (!title || !artist) {
        return reply.code(400).send({ error: "Parametri title e artist obbligatori" });
      }
      const duration = request.query.duration ? Number(request.query.duration) : undefined;
      const lrc = await fetchLrcFromLrclib(title, artist, duration);
      if (!lrc) {
        return reply.code(404).send({ error: "Nessun testo trovato" });
      }
      return reply.send(lrc);
    }
  );

  /** Stato dei cookies PERSONALI dell'admin loggato (ogni admin ha il proprio file). */
  fastify.get(
    "/admin/youtube/cookies-status",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const own = getAdminCookiesPath(jwt.sub);
      if (existsSync(own)) {
        const s = await stat(own);
        return reply.send({
          configured: true,
          source: "personal",
          size: s.size,
          mtime: s.mtime.toISOString(),
        });
      }
      const fallback = resolveYoutubeCookiesPath();
      return reply.send({
        configured: false,
        source: "personal",
        fallback: fallback ? "globale (env o file condiviso)" : null,
        hint: "Carica i tuoi cookies (formato Netscape): valgono per le tue serate",
      });
    }
  );

  fastify.post(
    "/admin/youtube/cookies",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "Nessun file (field name: file)" });
      }
      const buf = await file.toBuffer();
      if (buf.length > 2 * 1024 * 1024) {
        return reply.code(400).send({ error: "File troppo grande (max 2MB)" });
      }
      await ensureStorageLayout();
      await writeFile(getAdminCookiesPath(jwt.sub), buf);
      return reply.send({
        ok: true,
        note: "Cookies personali salvati: usati per ricerca e download delle tue serate",
      });
    }
  );

  fastify.delete(
    "/admin/youtube/cookies",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const own = getAdminCookiesPath(jwt.sub);
      if (existsSync(own)) {
        await unlink(own);
      }
      return reply.send({ ok: true });
    }
  );

  /** Pre-download del video (opzionale): evita la pubblicità dell'embed sul display. */
  fastify.post<{ Params: { bookingId: string } }>(
    "/admin/youtube/process/:bookingId",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const booking = await prisma.booking.findUnique({
        where: { id: request.params.bookingId },
        select: { eventId: true },
      });
      if (!booking) {
        return reply.code(404).send({ error: "Prenotazione non trovata" });
      }
      if (!(await canManageEvent(request.user as JwtPayload, booking.eventId))) {
        return reply.code(403).send({ error: "Questa serata è gestita da un altro admin" });
      }
      try {
        await startYoutubeProcess(request.params.bookingId);
        return reply.code(202).send({ ok: true, message: "Download video avviato" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.code(400).send({ error: msg });
      }
    }
  );
}
