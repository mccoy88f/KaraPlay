import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { isAllowedGleitzFolder } from "../lib/soundfontBanks.js";
import { getStorageRoot } from "../lib/storage.js";

const SOUNDFONT_FILE_RE = /^[a-z0-9_]+-(mp3|ogg)\.js$/;

export async function registerMediaRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { folder: string; file: string } }>(
    "/media/soundfont/:folder/:file",
    async (request, reply) => {
      const folder = request.params.folder;
      const file = request.params.file;
      if (file !== path.basename(file)) {
        return reply.code(400).send({ error: "Nome file non valido" });
      }
      if (!isAllowedGleitzFolder(folder)) {
        return reply.code(404).send({ error: "Banco non valido" });
      }
      if (!SOUNDFONT_FILE_RE.test(file)) {
        return reply.code(400).send({ error: "Nome file non valido" });
      }
      const abs = path.join(getStorageRoot(), "soundfonts", folder, file);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({
          error: "Soundfont non presente sul server. Dall’admin, scarica il banco prima del karaoke.",
        });
      }
      reply.header("Cache-Control", "public, max-age=31536000");
      reply.type("application/javascript; charset=utf-8");
      return reply.send(createReadStream(abs));
    }
  );

  fastify.get<{ Params: { songId: string } }>("/media/song/:songId/midi", async (request, reply) => {
    const song = await prisma.song.findUnique({
      where: { id: request.params.songId },
    });
    if (!song?.midiPath) {
      return reply.code(404).send({ error: "MIDI non disponibile" });
    }
    const abs = path.join(getStorageRoot(), song.midiPath);
    try {
      await access(abs);
    } catch {
      return reply.code(404).send({ error: "File non trovato" });
    }
    reply.header("Cache-Control", "public, max-age=86400");
    reply.type("audio/midi");
    return reply.send(createReadStream(abs));
  });

  fastify.get<{ Params: { songId: string } }>("/media/song/:songId/lrc", async (request, reply) => {
    const song = await prisma.song.findUnique({
      where: { id: request.params.songId },
    });
    if (!song?.lrcPath) {
      return reply.code(404).send({ error: "Testo LRC non disponibile" });
    }
    const abs = path.join(getStorageRoot(), song.lrcPath);
    try {
      await access(abs);
    } catch {
      return reply.code(404).send({ error: "File non trovato" });
    }
    reply.header("Cache-Control", "public, max-age=86400");
    reply.type("text/plain; charset=utf-8");
    return reply.send(createReadStream(abs));
  });

  fastify.get<{ Params: { bookingId: string } }>("/media/yt/:bookingId", async (request, reply) => {
    const booking = await prisma.booking.findUnique({
      where: { id: request.params.bookingId },
      include: { song: true },
    });
    const rel = booking?.song?.mp3Path;
    if (!booking || !rel) {
      return reply.code(404).send({ error: "Audio non disponibile" });
    }
    const abs = path.join(getStorageRoot(), rel);
    try {
      await access(abs);
    } catch {
      return reply.code(404).send({ error: "File non trovato sul disco" });
    }

    reply.header("Cache-Control", "public, max-age=3600");
    reply.type("audio/ogg");
    return reply.send(createReadStream(abs));
  });
}
