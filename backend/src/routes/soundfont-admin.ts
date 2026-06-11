import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/admin.js";
import { getSoundfontBankById } from "../lib/soundfontBanks.js";
import { getSoundfontBankStatus, syncSoundfontBank } from "../services/soundfont-sync.service.js";

const bankIds = ["fluid_r3", "musyng_kite", "fatboy"] as const;

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
    { preHandler: [requireAdmin] },
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
}
