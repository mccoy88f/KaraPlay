import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Protezione route admin disattivata temporaneamente.
 * Prossimo step: account admin (email/password) + sessione/JWT dedicata.
 *
 * Per riattivare il vecchio bearer `ADMIN_TOKEN`, reintrodurre il controllo qui
 * (o usare `ADMIN_REQUIRE_TOKEN=true` e leggere l’env).
 */
export async function requireAdmin(_request: FastifyRequest, _reply: FastifyReply) {
  /* auth disattivata */
}
