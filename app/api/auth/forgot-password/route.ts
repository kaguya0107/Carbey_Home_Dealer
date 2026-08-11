import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPublicSupabaseConfig, getServiceRoleKey, isSmtpConfigured } from '@/lib/env'
import { generateRecoveryLink } from '@/lib/auth/adminLinks'
import { sendEmail } from '@/lib/email/sendEmail'
import { recoveryEmail } from '@/lib/email/templates'

/**
 * パスワード再設定リクエスト。自前SMTP で再設定メールを送る (パターンX)。
 * メール存在の有無に関わらず常に成功を返す (アカウント列挙対策)。
 */
export async function POST(request: NextRequest) {
  let email = ''
  try {
    const body = await request.json()
    email = String(body.email ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  if (!isSmtpConfigured()) {
    return NextResponse.json({ error: 'SMTP not configured' }, { status: 503 })
  }

  try {
    // ユーザーが存在する場合のみ送信 (存在しなくても 200 を返す)
    const { url } = getPublicSupabaseConfig()
    const admin = createClient(url, getServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const exists = data.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())

    if (exists) {
      const link = await generateRecoveryLink(email)
      const { subject, html } = recoveryEmail({ url: link })
      await sendEmail({ to: email, subject, html })
    }
  } catch {
    // 失敗時も列挙を防ぐため 200 を返す (ログは将来のオブザーバビリティで)
  }

  return NextResponse.json({ ok: true })
}
