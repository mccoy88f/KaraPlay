import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { stat } from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { isAllowedGleitzFolder, isValidSf2FileName } from "../lib/soundfontBanks.js";
import { getSf2Dir, getStorageRoot } from "../lib/storage.js";

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

  /** File SoundFont (.sf2/.sf3) caricato dall'admin, usato dal player sul display. */
  fastify.get<{ Params: { file: string } }>("/media/sf2/:file", async (request, reply) => {
    const file = request.params.file;
    if (!isValidSf2FileName(file)) {
      return reply.code(400).send({ error: "Nome file non valido" });
    }
    const abs = path.join(getSf2Dir(), file);
    let size: number;
    try {
      size = (await stat(abs)).size;
    } catch {
      return reply.code(404).send({ error: "SoundFont non trovato sul server" });
    }
    reply.header("Cache-Control", "public, max-age=86400");
    reply.header("Content-Length", String(size));
    reply.type("application/octet-stream");
    return reply.send(createReadStream(abs));
  });

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

  /** Video YouTube pre-scaricato (mp4), con supporto Range per il seeking del tag <video>. */
  fastify.get<{ Params: { bookingId: string } }>("/media/yt/:bookingId", async (request, reply) => {
    const booking = await prisma.booking.findUnique({
      where: { id: request.params.bookingId },
      include: { song: { select: { mp3Path: true } } },
    });
    const rel = booking?.song?.mp3Path;
    if (!booking || !rel) {
      return reply.code(404).send({ error: "Video non disponibile (non ancora scaricato)" });
    }
    const abs = path.join(getStorageRoot(), rel);
    let size: number;
    try {
      size = (await stat(abs)).size;
    } catch {
      return reply.code(404).send({ error: "File non trovato sul disco" });
    }

    reply.header("Accept-Ranges", "bytes");
    reply.header("Cache-Control", "public, max-age=3600");
    reply.type("video/mp4");

    const range = request.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (m[1] === "" && m[2] === "")) {
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      }
      const start = m[1] ? Number.parseInt(m[1], 10) : Math.max(0, size - Number.parseInt(m[2], 10));
      const end = m[1] && m[2] ? Math.min(Number.parseInt(m[2], 10), size - 1) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      }
      reply.code(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${size}`);
      reply.header("Content-Length", String(end - start + 1));
      return reply.send(createReadStream(abs, { start, end }));
    }

    reply.header("Content-Length", String(size));
    return reply.send(createReadStream(abs));
  });
}
