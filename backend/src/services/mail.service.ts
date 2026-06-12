import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const from = process.env.SMTP_FROM || "noreply@localhost";
  const transport = getTransport();
  if (!transport) {
    console.info(`[mail disabilitata] OTP per ${to}: ${code}`);
    return;
  }
  await transport.sendMail({
    from,
    to,
    subject: "Il tuo codice KaraPlay",
    text: `Il tuo codice è: ${code}\nValido per 10 minuti.`,
  });
}
