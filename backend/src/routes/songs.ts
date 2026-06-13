import { writeFile, readFile, access, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

/** @tonejs/midi è CJS: in ESM serve require per evitare crash in Node. */
const require = createRequire(import.meta.url);
const { Midi } = require("@tonejs/midi") as { Midi: new (data: ArrayBuffer) => { duration: number } };
import { requireAdmin } from "../middleware/admin.js";
import { ensureStorageLayout, getStorageRoot } from "../lib/storage.js";
import type { JwtPayload } from "../types/jwt.js";
import { getIo } from "../socket/io.js";
import { analyzeMidiBuffer } from "../lib/midiDebug.js";
import { lookupItunesMidiMeta } from "../services/itunes-lookup.service.js";

function normalizeCoverUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function canAdminManageSong(jwt: JwtPayload, song: { adminId: string | null }): boolean {
  if (jwt.role === "superadmin") return true;
  return song.adminId === jwt.sub;
}

async function deleteSongAssetFiles(song: {
  midiPath: string | null;
  lrcPath: string | null;
  mp3Path: string | null;
}): Promise<void> {
  const root = getStorageRoot();
  for (const rel of [song.midiPath, song.lrcPath, song.mp3Path]) {
    if (!rel) continue;
    try {
      await unlink(path.join(root, rel));
    } catch {
      /* file già assente */
    }
  }
}

async function deleteCatalogSong(
  songId: string,
  jwt: JwtPayload
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    return { ok: false, status: 404, error: "Canzone non trovata" };
  }
  if (song.source !== "MIDI") {
    return { ok: false, status: 400, error: "Solo i brani MIDI del catalogo possono essere eliminati" };
  }
  if (!canAdminManageSong(jwt, song)) {
    return { ok: false, status: 403, error: "Questo brano è di un altro admin" };
  }
  const performing = await prisma.booking.count({
    where: { songId: song.id, status: "PERFORMING" },
  });
  if (performing > 0) {
    return { ok: false, status: 409, error: "Brano in esibizione: non eliminabile ora" };
  }
  await prisma.$transaction([
    prisma.booking.updateMany({ where: { songId: song.id }, data: { songId: null } }),
    prisma.song.delete({ where: { id: song.id } }),
  ]);
  await deleteSongAssetFiles(song);
  return { ok: true };
}

export async function registerSongRoutes(fastify: FastifyInstance): Promise<void> {
  /** Catalogo visto dal pubblico di una serata: i brani MIDI dell'admin che la gestisce. */
  fastify.get<{ Params: { eventId: string }; Querystring: { q?: string; limit?: string; offset?: string } }>(
    "/events/:eventId/songs",
    async (request, reply) => {
      const event = await prisma.event.findUnique({
        where: { id: request.params.eventId },
        select: { adminId: true },
      });
      if (!event) {
        return reply.code(404).send({ error: "Serata non trovata" });
      }
      const q = request.query.q?.trim();
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? "40", 10) || 40, 1), 100);
      const offset = Math.max(Number.parseInt(request.query.offset ?? "0", 10) || 0, 0);
      const yearQuery = q ? Number.parseInt(q, 10) : Number.NaN;
      const yearFilter =
        q && Number.isInteger(yearQuery) && yearQuery >= 1900 && yearQuery <= 2100 && String(yearQuery) === q
          ? [{ year: yearQuery }]
          : [];
      const where = {
        source: "MIDI" as const,
        OR: event.adminId ? [{ adminId: event.adminId }, { adminId: null }] : [{ adminId: null }],
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { title: { contains: q, mode: "insensitive" as const } },
                    { artist: { contains: q, mode: "insensitive" as const } },
                    { fileName: { contains: q, mode: "insensitive" as const } },
                    { genre: { contains: q, mode: "insensitive" as const } },
                    ...yearFilter,
                  ],
                },
              ],
            }
          : {}),
      };
      const rows = await prisma.song.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: [{ artist: "asc" }, { title: "asc" }],
      });
      const hasMore = rows.length > limit;
      const songs = hasMore ? rows.slice(0, limit) : rows;
      return reply.send({ songs, hasMore });
    }
  );

  /** Catalogo personale dell'admin loggato (il super admin vede anche i legacy senza proprietario). */
  fastify.get("/admin/songs", { preHandler: [requireAdmin] }, async (request, reply) => {
    const jwt = request.user as JwtPayload;
    const songs = await prisma.song.findMany({
      where: {
        source: "MIDI",
        OR:
          jwt.role === "superadmin"
            ? [{ adminId: jwt.sub }, { adminId: null }]
            : [{ adminId: jwt.sub }],
      },
      take: 500,
      orderBy: [{ artist: "asc" }, { title: "asc" }],
    });
    return reply.send({ songs });
  });

  fastify.get<{ Params: { id: string } }>("/songs/:id", async (request, reply) => {
    const song = await prisma.song.findUnique({
      where: { id: request.params.id },
    });
    if (!song) {
      return reply.code(404).send({ error: "Canzone non trovata" });
    }
    return reply.send(song);
  });

  const editSongSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    artist: z.string().min(1).max(200).optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    genre: z.string().max(80).nullable().optional(),
    language: z.string().max(20).nullable().optional(),
    coverUrl: z.string().max(2048).nullable().optional(),
  });

  /** Modifica dei metadati di un brano del catalogo (MIDI o video). */
  fastify.put<{ Params: { id: string } }>(
    "/admin/songs/:id",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = editSongSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi" });
      }
      const jwt = request.user as JwtPayload;
      const song = await prisma.song.findUnique({ where: { id: request.params.id } });
      if (!song) {
        return reply.code(404).send({ error: "Canzone non trovata" });
      }
      if (jwt.role !== "superadmin" && song.adminId !== jwt.sub) {
        return reply.code(403).send({ error: "Questo brano è di un altro admin" });
      }
      const d = parsed.data;
      const updated = await prisma.song.update({
        where: { id: song.id },
        data: {
          ...(d.title !== undefined ? { title: d.title.trim() } : {}),
          ...(d.artist !== undefined ? { artist: d.artist.trim() } : {}),
          ...(d.year !== undefined ? { year: d.year } : {}),
          ...(d.genre !== undefined ? { genre: d.genre?.trim() || null } : {}),
          ...(d.language !== undefined ? { language: d.language?.trim() || null } : {}),
          ...(d.coverUrl !== undefined ? { coverUrl: normalizeCoverUrl(d.coverUrl) } : {}),
        },
      });
      return reply.send(updated);
    }
  );

  /**
   * Genere/anno da iTunes Search (gratuita, senza chiave): il client la usa per
   * precompilare i campi. Fallisce in modo morbido se la rete non risponde.
   */
  fastify.get<{ Querystring: { title?: string; artist?: string; fileName?: string } }>(
    "/admin/songs-meta-lookup",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const title = request.query.title?.trim();
      if (!title) {
        return reply.code(400).send({ error: "Parametro title obbligatorio" });
      }
      const artist = request.query.artist?.trim() ?? "";
      const fileName = request.query.fileName?.trim();
      try {
        const hit = await lookupItunesMidiMeta({ title, artist, fileName });
        if (!hit) {
          return reply.send({
            genre: null,
            year: null,
            coverUrl: null,
            foundTitle: null,
            foundArtist: null,
          });
        }
        return reply.send(hit);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.code(502).send({ error: `Lookup non disponibile: ${msg}` });
      }
    }
  );

  const mutedTrackSchema = z.object({
    track: z.number().int().min(1).max(32).nullable(),
  });

  const transposeSemitonesSchema = z.object({
    semitones: z.number().int().min(-12).max(12),
  });

  /** Tracce del file MIDI (per il selettore mute in console: numero traccia, non canale). */
  fastify.get<{ Params: { id: string } }>(
    "/admin/songs/:id/midi-tracks",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const song = await prisma.song.findUnique({ where: { id: request.params.id } });
      if (!song) {
        return reply.code(404).send({ error: "Canzone non trovata" });
      }
      if (song.source !== "MIDI" || !song.midiPath) {
        return reply.code(400).send({ error: "Solo i brani MIDI hanno tracce" });
      }
      if (jwt.role !== "superadmin" && song.adminId !== jwt.sub) {
        return reply.code(403).send({ error: "Questo brano è di un altro admin" });
      }
      const abs = path.join(getStorageRoot(), song.midiPath);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "File MIDI assente sul disco" });
      }
      const buf = await readFile(abs);
      const { trackOptions } = analyzeMidiBuffer(buf);
      return reply.send({ tracks: trackOptions });
    }
  );

  /** Silenzia una traccia del MIDI (voce guida): vale per tutte le esecuzioni del brano. */
  fastify.put<{ Params: { id: string } }>(
    "/admin/songs/:id/muted-track",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = mutedTrackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Traccia non valida (1-32 o null)" });
      }
      const jwt = request.user as JwtPayload;
      const song = await prisma.song.findUnique({ where: { id: request.params.id } });
      if (!song) {
        return reply.code(404).send({ error: "Canzone non trovata" });
      }
      if (song.source !== "MIDI") {
        return reply.code(400).send({ error: "Solo i brani MIDI hanno tracce da silenziare" });
      }
      if (jwt.role !== "superadmin" && song.adminId !== jwt.sub) {
        return reply.code(403).send({ error: "Questo brano è di un altro admin" });
      }
      const updated = await prisma.song.update({
        where: { id: song.id },
        data: { mutedTrack: parsed.data.track },
      });
      // se il brano è sul palco in questo momento, il display applica il mute al volo
      const performing = await prisma.booking.findMany({
        where: { songId: song.id, status: "PERFORMING" },
        select: { eventId: true },
      });
      for (const b of performing) {
        getIo()?.to(`event:${b.eventId}`).emit("song:muted-track", {
          songId: song.id,
          mutedTrack: parsed.data.track,
        });
      }
      return reply.send(updated);
    }
  );

  /** Trasposizione in semitoni: vale per tutte le esecuzioni del brano e si applica live sul display. */
  fastify.put<{ Params: { id: string } }>(
    "/admin/songs/:id/transpose-semitones",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = transposeSemitonesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Trasposizione non valida (-12…+12 semitoni)" });
      }
      const jwt = request.user as JwtPayload;
      const song = await prisma.song.findUnique({ where: { id: request.params.id } });
      if (!song) {
        return reply.code(404).send({ error: "Canzone non trovata" });
      }
      if (song.source !== "MIDI" && song.source !== "YOUTUBE") {
        return reply.code(400).send({ error: "Solo brani MIDI e video scaricati hanno tonalità regolabile" });
      }
      if (jwt.role !== "superadmin" && song.adminId !== jwt.sub) {
        return reply.code(403).send({ error: "Questo brano è di un altro admin" });
      }
      const updated = await prisma.song.update({
        where: { id: song.id },
        data: { transposeSemitones: parsed.data.semitones },
      });
      const performing = await prisma.booking.findMany({
        where: { songId: song.id, status: "PERFORMING" },
        select: { eventId: true },
      });
      for (const b of performing) {
        getIo()?.to(`event:${b.eventId}`).emit("song:transpose-semitones", {
          songId: song.id,
          transposeSemitones: parsed.data.semitones,
        });
      }
      return reply.send(updated);
    }
  );

  const createSongSchema = z.object({
    title: z.string().min(1),
    artist: z.string().min(1),
    midiPath: z.string().optional(),
    lrcPath: z.string().optional(),
    duration: z.number().int().positive().optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  fastify.post(
    "/admin/songs",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = createSongSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }
      const body = parsed.data;
      const song = await prisma.song.create({
        data: {
          title: body.title,
          artist: body.artist,
          adminId: (request.user as JwtPayload).sub,
          source: "MIDI",
          midiPath: body.midiPath ?? null,
          lrcPath: body.lrcPath ?? null,
          duration: body.duration ?? null,
          language: body.language ?? null,
          tags: body.tags ?? [],
        },
      });
      return reply.code(201).send(song);
    }
  );

  fastify.post(
    "/admin/songs/upload",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      let title = "";
      let artist = "";
      let language = "";
      let year: number | null = null;
      let genre: string | null = null;
      let fileName: string | null = null;
      let coverUrl: string | null = null;
      let midiBuf: Buffer | null = null;
      let lrcBuf: Buffer | null = null;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname === "midi") {
            midiBuf = await part.toBuffer();
            // nome file originale, con estensione, sempre conservato
            fileName = path.basename(part.filename ?? "").trim() || null;
          } else if (part.fieldname === "lrc") {
            lrcBuf = await part.toBuffer();
          }
        } else {
          const v = String(part.value ?? "").trim();
          if (part.fieldname === "title") title = v;
          if (part.fieldname === "artist") artist = v;
          if (part.fieldname === "language") language = v;
          if (part.fieldname === "genre") {
            // genere passato dal client (lookup online in fase di import)
            if (v) genre = v.slice(0, 80);
          }
          if (part.fieldname === "year") {
            const n = Number.parseInt(v, 10);
            year = Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
          }
          if (part.fieldname === "coverUrl") {
            coverUrl = normalizeCoverUrl(v);
          }
        }
      }

      if (!title || !artist) {
        return reply.code(400).send({ error: "Titolo e artista sono obbligatori" });
      }
      if (!midiBuf || midiBuf.length === 0) {
        return reply.code(400).send({ error: "File MIDI obbligatorio" });
      }

      if (!coverUrl) {
        try {
          const hit = await lookupItunesMidiMeta({ title, artist, fileName: fileName ?? undefined });
          coverUrl = hit?.coverUrl ?? null;
          if (!genre && hit?.genre) genre = hit.genre.slice(0, 80);
          if (!year && hit?.year) year = hit.year;
        } catch {
          /* upload senza copertina se iTunes non risponde */
        }
      }

      const root = getStorageRoot();
      await ensureStorageLayout();

      const song = await prisma.song.create({
        data: {
          title,
          artist,
          adminId: (request.user as JwtPayload).sub,
          source: "MIDI",
          midiPath: null,
          lrcPath: null,
          duration: null,
          language: language || null,
          year,
          genre,
          fileName,
          coverUrl,
          tags: ["upload"],
        },
      });

      const midiRel = `midi/${song.id}.mid`;
      const midiAbs = path.join(root, midiRel);
      await writeFile(midiAbs, midiBuf);

      let duration: number | null = null;
      try {
        const ab = midiBuf.buffer.slice(
          midiBuf.byteOffset,
          midiBuf.byteOffset + midiBuf.byteLength
        ) as ArrayBuffer;
        const midi = new Midi(ab);
        duration = Number.isFinite(midi.duration) ? Math.round(midi.duration) : null;
      } catch {
        duration = null;
      }

      let lrcRel: string | null = null;
      if (lrcBuf && lrcBuf.length > 0) {
        lrcRel = `lrc/${song.id}.lrc`;
        await writeFile(path.join(root, lrcRel), lrcBuf);
      }

      const updated = await prisma.song.update({
        where: { id: song.id },
        data: {
          midiPath: midiRel,
          lrcPath: lrcRel,
          duration,
        },
      });

      return reply.code(201).send(updated);
    }
  );

  /** Elimina un brano MIDI dal catalogo (file + record). */
  fastify.delete<{ Params: { id: string } }>(
    "/admin/songs/:id",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const result = await deleteCatalogSong(request.params.id, jwt);
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error });
      }
      return reply.send({ ok: true });
    }
  );

  const bulkDeleteSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
  });

  /** Elimina più brani MIDI dal catalogo in un'unica richiesta. */
  fastify.post(
    "/admin/songs/bulk-delete",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const parsed = bulkDeleteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Lista ID non valida" });
      }
      const jwt = request.user as JwtPayload;
      let deleted = 0;
      const errors: string[] = [];
      for (const id of parsed.data.ids) {
        const result = await deleteCatalogSong(id, jwt);
        if (result.ok) {
          deleted += 1;
        } else {
          errors.push(`${id}: ${result.error}`);
        }
      }
      return reply.send({ deleted, errors });
    }
  );
}
