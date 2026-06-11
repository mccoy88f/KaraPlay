import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerSongRoutes } from "./routes/songs.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerPerformanceRoutes } from "./routes/performances.js";
import { registerYoutubeRoutes } from "./routes/youtube.js";
import { registerAdminBookingRoutes } from "./routes/admin-bookings.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerSoundfontAdminRoutes } from "./routes/soundfont-admin.js";
import { registerTestRoutes } from "./routes/test.js";
import { registerAdminQueueRoutes } from "./routes/admin-queue.js";
import { registerMidiDebugRoutes } from "./routes/midi-debug.js";
import { registerVoteRoutes } from "./routes/votes.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { registerLeaderboardRoutes } from "./routes/leaderboard.js";
import type { JwtPayload } from "./types/jwt.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET mancante");
  }

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024 },
  });
  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: "8h" },
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(registerAuthRoutes, { prefix: "/api/auth" });
  await app.register(registerEventRoutes, { prefix: "/api" });
  await app.register(registerSongRoutes, { prefix: "/api" });
  await app.register(registerBookingRoutes, { prefix: "/api" });
  await app.register(registerPerformanceRoutes, { prefix: "/api" });
  await app.register(registerYoutubeRoutes, { prefix: "/api" });
  await app.register(registerAdminBookingRoutes, { prefix: "/api" });
  await app.register(registerAdminQueueRoutes, { prefix: "/api" });
  await app.register(registerMediaRoutes, { prefix: "/api" });
  await app.register(registerSoundfontAdminRoutes, { prefix: "/api" });
  await app.register(registerTestRoutes, { prefix: "/api" });
  await app.register(registerMidiDebugRoutes, { prefix: "/api" });
  await app.register(registerVoteRoutes, { prefix: "/api" });
  await app.register(registerCommentRoutes, { prefix: "/api" });
  await app.register(registerLeaderboardRoutes, { prefix: "/api" });

  return app;
}
