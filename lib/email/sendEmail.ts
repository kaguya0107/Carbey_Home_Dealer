import nodemailer from 'nodemailer'
import { getSmtpConfig, isSmtpConfigured } from '@/lib/env'

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export { isSmtpConfigured }

/** nodemailer で自前SMTP からメール送信する。サーバー専用。 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const cfg = getSmtpConfig()
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  })

  await transporter.sendMail({
    from: cfg.from,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  })
}
