import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { createOtp, verifyOtp } from "../services/otp.service.js";
import { sendOtpEmail } from "../services/mail.service.js";
import type { JwtPayload } from "../types/jwt.js";
import { requireJwt } from "../middleware/jwt.js";

const joinSchema = z.object({
  nickname: z.string().min(1).max(40),
  eventJoinCode: z.string().min(4).max(32),
});

const requestOtpSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const linkPhoneSchema = z.object({
  phone: z.string().min(6).max(32),
  marketingOk: z.boolean(),
});

function signGuestToken(
  fastify: FastifyInstance,
  userId: string,
  nickname: string,
  eventId: string
): string {
  const payload: JwtPayload = {
    sub: userId,
    nickname,
    eventId,
    role: "guest",
  };
  return fastify.jwt.sign(payload);
}

function signUserToken(
  fastify: FastifyInstance,
  userId: string,
  nickname: string,
  eventId: string
): string {
  const payload: JwtPayload = {
    sub: userId,
    nickname,
    eventId,
    role: "user",
  };
  return fastify.jwt.sign(payload);
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/join", async (request, reply) => {
    const parsed = joinSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const { nickname, eventJoinCode } = parsed.data;
    const code = eventJoinCode.trim();
    const event = await prisma.event.findUnique({
      where: { joinCode: code },
    });
    if (!event) {
      return reply.code(404).send({ error: "Serata non trovata" });
    }
    if (event.status === "ENDED" || event.status === "DRAFT") {
      return reply.code(403).send({ error: "Serata non accessibile" });
    }

    const sessionToken = crypto.randomBytes(24).toString("hex");
    const user = await prisma.user.create({
      data: { nickname: nickname.trim(), sessionToken },
    });

    const token = signGuestToken(fastify, user.id, user.nickname, event.id);
    return reply.send({
      token,
      user: { id: user.id, nickname: user.nickname },
      event: {
        id: event.id,
        name: event.name,
        joinCode: event.joinCode,
        status: event.status,
        soundfontBankId: event.soundfontBankId,
      },
    });
  });

  fastify.post("/request-otp", async (request, reply) => {
    const parsed = requestOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Email non valida" });
    }
    const email = parsed.data.email.toLowerCase().trim();
    const code = await createOtp(email);
    await sendOtpEmail(email, code);
    return reply.send({ ok: true, message: "Se SMTP è configurato, controlla la posta" });
  });

  fastify.post("/verify-otp", { preHandler: [requireJwt] }, async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dati non validi" });
    }
    const jwt = request.user as JwtPayload;
    if (jwt.role !== "guest") {
      return reply.code(400).send({ error: "Serve un token guest ottenuto dopo il join" });
    }

    const { email, code } = parsed.data;
    const ok = await verifyOtp(email, code);
    if (!ok) {
      return reply.code(400).send({ error: "Codice non valido o scaduto" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const conflict = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        NOT: { id: jwt.sub },
      },
    });
    if (conflict) {
      return reply.code(409).send({ error: "Email già usata da un altro account" });
    }

    const user = await prisma.user.update({
      where: { id: jwt.sub },
      data: {
        email: normalizedEmail,
        emailVerified: true,
      },
    });

    const eventId = jwt.eventId;
    const token = signUserToken(fastify, user.id, user.nickname, eventId);
    return reply.send({
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  });

  fastify.post(
    "/link-phone",
    { preHandler: [requireJwt] },
    async (request, reply) => {
      const parsed = linkPhoneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dati non validi" });
      }
      const jwt = request.user as JwtPayload;
      const { phone, marketingOk } = parsed.data;
      await prisma.user.update({
        where: { id: jwt.sub },
        data: { phone, marketingOk },
      });
      return reply.send({ ok: true });
    }
  );
}
