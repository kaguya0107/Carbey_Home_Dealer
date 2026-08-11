import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/admin'

/**
 * ログイン直後の遷移先をロールで振り分ける + ログイン履歴を記録 (要求書 5.2)。
 *   admin/crm_staff/chat_only → /admin/dashboard
 *   member                    → /portal/dashboard
 * portal.users 未登録なら /login?error=forbidden。
 */
export async function GET(request: NextRequest) {
  const session = await getSessionUser()
  const origin = request.nextUrl.origin

  if (!session) {
    return NextResponse.redirect(new URL('/login?error=forbidden', origin))
  }

  // 加盟店はログイン履歴 (last_login_at) を更新
  if (session.role === 'member') {
    try {
      const admin = createServiceRoleClient()
      await admin
        .from('members')
        .update({ last_login_at: new Date().toISOString() } as never)
        .eq('user_id', session.userId)
    } catch {
      // ログイン履歴の記録失敗はログインを妨げない
    }
  }

  const redirect = request.nextUrl.searchParams.get('redirect')
  if (redirect && redirect.startsWith('/')) {
    return NextResponse.redirect(new URL(redirect, origin))
  }

  const staff = session.role !== 'member'
  const dest = staff ? '/admin/dashboard' : '/portal/dashboard'
  return NextResponse.redirect(new URL(dest, origin))
}
