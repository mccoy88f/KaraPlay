import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { analyzeMidiBuffer } from "../lib/midiDebug.js";
import { requireSuperAdmin } from "../middleware/admin.js";
import { getStorageRoot } from "../lib/storage.js";

/** Stessi host del proxy test (evita SSRF). */
const ALLOWED_MIDI_HOSTS = new Set([
  "gsarchive.net",
  "www.gsarchive.net",
  "digilander.libero.it",
  "www.digilander.libero.it",
]);

const FETCH_HEADERS = {
  Accept: "audio/midi, application/octet-stream, */*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function validateRemoteMidiUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!ALLOWED_MIDI_HOSTS.has(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchMidiRemote(sourceUrl: string, reply: FastifyReply): Promise<Buffer | null> {
  try {
    const res = await fetch(sourceUrl, { headers: FETCH_HEADERS });
    if (!res.ok) {
      reply.code(502).send({ error: `Origine MIDI: HTTP ${res.status}` });
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    reply.code(502).send({
      error: e instanceof Error ? e.message : "Download MIDI fallito",
    });
    return null;
  }
}

export async function registerMidiDebugRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { songId: string } }>(
    "/admin/songs/:songId/midi-debug",
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const song = await prisma.song.findUnique({
        where: { id: request.params.songId },
      });
      if (!song?.midiPath) {
        return reply.code(404).send({ error: "Canzone non trovata o senza MIDI" });
      }
      const abs = path.join(getStorageRoot(), song.midiPath);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "File MIDI assente sul disco" });
      }
      const buf = await readFile(abs);
      const midi = analyzeMidiBuffer(buf);
      return reply.send({
        song: {
          id: song.id,
          title: song.title,
          artist: song.artist,
        },
        midi,
      });
    }
  );

  fastify.get<{ Querystring: { url?: string } }>(
    "/admin/midi-debug/by-url",
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const raw = request.query.url?.trim();
      if (!raw) {
        return reply.code(400).send({ error: "Parametro url obbligatorio" });
      }
      const parsed = validateRemoteMidiUrl(raw);
      if (!parsed) {
        return reply.code(400).send({ error: "URL non consentito o non valido" });
      }
      const buf = await fetchMidiRemote(parsed.toString(), reply);
      if (buf === null) return;
      const midi = analyzeMidiBuffer(buf);
      return reply.send({
        song: null,
        sourceUrl: parsed.toString(),
        midi,
      });
    }
  );
}
