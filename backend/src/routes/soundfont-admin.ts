import { createWriteStream } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { requireAdmin, requireSuperAdmin } from "../middleware/admin.js";
import { getSoundfontBankById, isValidSf2FileName } from "../lib/soundfontBanks.js";
import { getSoundfontBankStatus, syncSoundfontBank } from "../services/soundfont-sync.service.js";
import { ensureStorageLayout, getSf2Dir } from "../lib/storage.js";

const bankIds = ["fluid_r3", "musyng_kite", "fatboy"] as const;

/** I banchi GM completi (es. FluidR3) superano i 100MB. */
const SF2_MAX_BYTES = 400 * 1024 * 1024;

export async function registerSoundfontAdminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { bankId: string } }>(
    "/admin/soundfonts/:bankId/status",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const bankId = request.params.bankId;
      if (!bankIds.includes(bankId as (typeof bankIds)[number])) {
        return reply.code(400).send({ error: "bankId non valido" });
      }
      const status = await getSoundfontBankStatus(bankId);
      return reply.send(status);
    }
  );

  fastify.post<{ Params: { bankId: string } }>(
    "/admin/soundfonts/:bankId/sync",
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const bankId = request.params.bankId;
      if (!bankIds.includes(bankId as (typeof bankIds)[number])) {
        return reply.code(400).send({ error: "bankId non valido" });
      }
      getSoundfontBankById(bankId);
      const result = await syncSoundfontBank(bankId);
      const status = await getSoundfontBankStatus(bankId);
      return reply.send({ ...result, status });
    }
  );

  /** Elenco dei file SoundFont (.sf2/.sf3) caricati. */
  fastify.get("/admin/soundfonts/sf2", { preHandler: [requireAdmin] }, async (_request, reply) => {
    await ensureStorageLayout();
    const dir = getSf2Dir();
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      names = [];
    }
    const files: { file: string; size: number }[] = [];
    for (const name of names) {
      if (!isValidSf2FileName(name)) continue;
      try {
        const s = await stat(path.join(dir, name));
        if (s.isFile()) files.push({ file: name, size: s.size });
      } catch {
        /* file sparito tra readdir e stat */
      }
    }
    files.sort((a, b) => a.file.localeCompare(b.file));
    return reply.send({ files });
  });

  /** Upload di un file SoundFont (multipart, field name: file). */
  fastify.post("/admin/soundfonts/sf2/upload", { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: SF2_MAX_BYTES } });
    if (!file) {
      return reply.code(400).send({ error: "Nessun file (field name: file)" });
    }
    const name = path.basename(file.filename ?? "").trim();
    if (!isValidSf2FileName(name)) {
      return reply.code(400).send({
        error: "Nome file non valido: usa solo lettere/numeri/spazi/._- ed estensione .sf2 o .sf3",
      });
    }
    await ensureStorageLayout();
    const dest = path.join(getSf2Dir(), name);
    try {
      await pipeline(file.file, createWriteStream(dest));
    } catch (e) {
      try {
        await unlink(dest);
      } catch {
        /* niente da pulire */
      }
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ error: `Scrittura fallita: ${msg}` });
    }
    if (file.file.truncated) {
      await unlink(dest);
      return reply.code(400).send({ error: `File troppo grande (max ${SF2_MAX_BYTES / (1024 * 1024)}MB)` });
    }
    const s = await stat(dest);
    return reply.send({ ok: true, file: name, size: s.size, bankId: `sf2:${name}` });
  });

  fastify.delete<{ Params: { file: string } }>(
    "/admin/soundfonts/sf2/:file",
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const name = request.params.file;
      if (!isValidSf2FileName(name)) {
        return reply.code(400).send({ error: "Nome file non valido" });
      }
      try {
        await unlink(path.join(getSf2Dir(), name));
      } catch {
        return reply.code(404).send({ error: "File non trovato" });
      }
      return reply.send({ ok: true });
    }
  );
}
