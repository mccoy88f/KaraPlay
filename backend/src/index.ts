import "dotenv/config";
import { Server } from "socket.io";
import { buildApp } from "./app.js";
import { setupSocket } from "./socket/index.js";
import { setIo } from "./socket/io.js";
import { ensureStorageLayout } from "./lib/storage.js";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

async function main() {
  await ensureStorageLayout();
  const app = await buildApp();
  await app.listen({ port, host });

  const io = new Server(app.server, {
    cors: { origin: true, credentials: true },
  });
  setIo(io);
  setupSocket(io);

  app.log.info(`API su http://${host}:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
