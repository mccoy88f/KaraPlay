import { writeFile } from "node:fs/promises";
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

export async function registerSongRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { q?: string } }>("/songs", async (request, reply) => {
    const q = request.query.q?.trim();
    const songs = await prisma.song.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { artist: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      take: 50,
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
      let midiBuf: Buffer | null = null;
      let lrcBuf: Buffer | null = null;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname === "midi") {
            midiBuf = await part.toBuffer();
          } else if (part.fieldname === "lrc") {
            lrcBuf = await part.toBuffer();
          }
        } else {
          const v = String(part.value ?? "").trim();
          if (part.fieldname === "title") title = v;
          if (part.fieldname === "artist") artist = v;
          if (part.fieldname === "language") language = v;
        }
      }

      if (!title || !artist) {
        return reply.code(400).send({ error: "Titolo e artista sono obbligatori" });
      }
      if (!midiBuf || midiBuf.length === 0) {
        return reply.code(400).send({ error: "File MIDI obbligatorio" });
      }

      const root = getStorageRoot();
      await ensureStorageLayout();

      const song = await prisma.song.create({
        data: {
          title,
          artist,
          source: "MIDI",
          midiPath: null,
          lrcPath: null,
          duration: null,
          language: language || null,
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
}
