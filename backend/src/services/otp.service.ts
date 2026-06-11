import { prisma } from "../lib/prisma.js";

const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOtp(email: string): Promise<string> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpCode.create({
    data: { email: email.toLowerCase().trim(), code, expiresAt },
  });
  return code;
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const record = await prisma.otpCode.findFirst({
    where: {
      email: normalized,
      code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return false;
  await prisma.otpCode.update({
    where: { id: record.id },
    data: { used: true },
  });
  return true;
}
