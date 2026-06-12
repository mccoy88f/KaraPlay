import { unlink, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../middleware/admin.js";
import {
  ensureStorageLayout,
  getDefaultYoutubeCookiesPath,
  resolveYoutubeCookiesPath,
} from "../lib/storage.js";
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
      try {
        const results = await searchYoutube(q, Number.isFinite(limit) ? limit : 8);
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

  fastify.get(
    "/admin/youtube/cookies-status",
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      const resolved = resolveYoutubeCookiesPath();
      const def = getDefaultYoutubeCookiesPath();
      const fromEnv = Boolean(process.env.YOUTUBE_COOKIES_PATH?.trim());
      if (!resolved) {
        return reply.send({
          configured: false,
          source: fromEnv ? "env" : "admin",
          hint: "Carica un file cookies Netscape da Admin o imposta YOUTUBE_COOKIES_PATH",
        });
      }
      try {
        const s = await stat(resolved);
        return reply.send({
          configured: true,
          path: resolved,
          source: fromEnv && resolved === process.env.YOUTUBE_COOKIES_PATH?.trim() ? "env" : "admin",
          size: s.size,
          mtime: s.mtime.toISOString(),
        });
      } catch {
        return reply.send({ configured: false, error: "File non leggibile" });
      }
    }
  );

  fastify.post(
    "/admin/youtube/cookies",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "Nessun file (field name: file)" });
      }
      const buf = await file.toBuffer();
      if (buf.length > 2 * 1024 * 1024) {
        return reply.code(400).send({ error: "File troppo grande (max 2MB)" });
      }
      await ensureStorageLayout();
      const dest = getDefaultYoutubeCookiesPath();
      await writeFile(dest, buf);
      return reply.send({
        ok: true,
        savedAs: "cookies/youtube.txt",
        note: "Riavvia l'elaborazione se yt-dlp falliva per autenticazione",
      });
    }
  );

  fastify.delete(
    "/admin/youtube/cookies",
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      const def = getDefaultYoutubeCookiesPath();
      if (existsSync(def)) {
        await unlink(def);
      }
      return reply.send({ ok: true });
    }
  );

  /** Pre-download del video (opzionale): evita la pubblicità dell'embed sul display. */
  fastify.post<{ Params: { bookingId: string } }>(
    "/admin/youtube/process/:bookingId",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
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
