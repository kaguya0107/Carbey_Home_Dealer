import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createMember } from '@/lib/portal/members'
import { notifyAdmin } from '@/lib/portal/notifications'

/**
 * 加盟店の申込（公開・認証不要）。
 * 要求書の権限管理思想に合わせ、即ログインさせず status='pending' で作成し、
 * 本部の承認（招待メール送信）を待つ。
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const str = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? null : s
  }

  const member_name = str(body.member_name)
  const email = str(body.email)
  if (!member_name || !email) {
    return NextResponse.json({ error: 'name_email_required' }, { status: 400 })
  }
  // 簡易メール形式チェック
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // 重複申込の抑止（同じメールで pending/active が既にあれば成功扱いで返す＝列挙対策）
  const { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('email', email)
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  try {
    const member = await createMember({
      member_name,
      company_name: str(body.company_name),
      email,
      phone_mobile: str(body.phone),
      status: 'pending',
    })
    await notifyAdmin(
      'member_registered',
      '新規加盟店の申込',
      `${member.company_name ?? member.member_name} から加盟申込がありました（承認待ち）`,
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
