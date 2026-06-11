import type { FastifyInstance, FastifyReply } from "fastify";

/** Host consentiti per il proxy MIDI (evita SSRF verso la rete interna). */
const ALLOWED_MIDI_HOSTS = new Set([
  "gsarchive.net",
  "www.gsarchive.net",
  "digilander.libero.it",
  "www.digilander.libero.it",
]);

/** File corto, adatto a smoke test / health (il Modugno lungo va tramite midi-proxy). */
const DEFAULT_TEST_MIDI = "https://gsarchive.net/html/sounds/test.mid";

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

const FETCH_HEADERS = {
  Accept: "audio/midi, application/octet-stream, */*",
  /** Alcuni host (es. digilander) rispondono male a fetch senza User-Agent da datacenter/Docker. */
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function fetchMidiFromUrl(sourceUrl: string, reply: FastifyReply) {
  try {
    const res = await fetch(sourceUrl, {
      headers: FETCH_HEADERS,
    });
    if (!res.ok) {
      return reply.code(502).send({ error: `Origine MIDI: HTTP ${res.status}` });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    reply.header("Cache-Control", "public, max-age=3600");
    reply.type("audio/midi");
    return reply.send(buf);
  } catch (e) {
    return reply.code(502).send({
      error: e instanceof Error ? e.message : "Download MIDI fallito",
    });
  }
}

export async function registerTestRoutes(fastify: FastifyInstance): Promise<void> {
  /** MIDI di prova predefinito (Modugno). */
  fastify.get("/test/midi-sample", async (_request, reply) => {
    return fetchMidiFromUrl(DEFAULT_TEST_MIDI, reply);
  });

  /** Proxy MIDI per pagina test / KaraokePlayer demo: ?url=https%3A%2F%2F... */
  fastify.get<{ Querystring: { url?: string } }>("/test/midi-proxy", async (request, reply) => {
    const raw = request.query.url?.trim();
    if (!raw) {
      return reply.code(400).send({ error: "Parametro url obbligatorio" });
    }
    const parsed = validateRemoteMidiUrl(raw);
    if (!parsed) {
      return reply.code(400).send({ error: "URL non consentito o non valido" });
    }
    return fetchMidiFromUrl(parsed.toString(), reply);
  });
}
