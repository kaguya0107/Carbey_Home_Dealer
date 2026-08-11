import { z } from 'zod'

const publicSupabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_URL is required'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
})

/** Validates public Supabase env. Safe on server or in client bundles (values are public). */
export function getPublicSupabaseConfig() {
  const parsed = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors
    throw new Error(`Invalid Supabase env: ${JSON.stringify(msg)}`)
  }
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = parsed.data
  return { url, anonKey }
}

export function getServiceRoleKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (k == null || k.trim() === '') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }
  return k
}

/** メールリンクの遷移先などに使うサイトURL。本番は環境変数、無ければリクエスト由来で補う。 */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  )
}

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

/** SMTP が設定済みか (未設定ならメール送信を行わずエラーを返す)。 */
export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)')
  }
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    user,
    pass,
    from: process.env.SMTP_FROM || user,
  }
}
