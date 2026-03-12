import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth:
    process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
})

export const mailService = {
  async sendOtp(email: string, code: string): Promise<void> {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'KaraokeGame <karaoke@example.com>',
      to: email,
      subject: `Il tuo codice di accesso: ${code}`,
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8B5CF6;">🎤 KaraokeGame</h2>
          <p>Il tuo codice di verifica è:</p>
          <div style="background: #1e1e2e; color: #a78bfa; font-size: 32px; font-weight: bold;
                      text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 8px;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">Valido per 10 minuti.</p>
        </div>
      `,
    })
  },
}
