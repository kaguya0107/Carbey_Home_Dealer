import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { getSessionUser, requireMember, type SessionUser } from '@/lib/auth/session'
import { canAccessWith } from '@/lib/auth/permissions'
import { getRolePermissionOverrides } from '@/lib/portal/role-permissions'
import { getMemberByUserId, type MemberWithPlan } from '@/lib/portal/members'

/**
 * Phase 4 AI：アクセスゲート。
 * ・加盟店AI … プランの feature_ai ＋ オンボーディング完了（または取引特例）が条件。
 *   残検索回数は呼び出し時に assertQuota/consumeSearch で判定（ここでは見ない）。
 * ・本部AI  … 本部スタッフの 'ai' 権限（admin=常時／crm_staff・chat_only は権限マトリクスの上書き）。
 */

function isOnboardingComplete(m: MemberWithPlan): boolean {
  return m.onboarding_total > 0 && m.onboarding_done >= m.onboarding_total
}

// ---- Page（Server Component）ガード：失敗時 redirect ----

export async function requireMemberAi(): Promise<{ session: SessionUser; member: MemberWithPlan }> {
  const session = await requireMember()
  const member = await getMemberByUserId(session.userId)
  if (!member) redirect('/login?error=forbidden')
  if (!member.plan?.feature_ai) redirect('/portal') // プランがAI非対象
  if (!isOnboardingComplete(member) && !member.trading_override) redirect('/portal') // オンボ未完了はロック
  return { session, member }
}

export async function requireStaffAi(): Promise<SessionUser> {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role === 'member') redirect('/login?error=forbidden')
  const allowed = canAccessWith(session.role, 'ai', await getRolePermissionOverrides())
  if (!allowed) redirect('/admin?error=forbidden')
  return session
}

// ---- API（Route Handler）ガード：失敗時 NextResponse ----

export type MemberAiGate =
  | { ok: true; session: SessionUser; member: MemberWithPlan; memberId: string }
  | { ok: false; response: NextResponse }

export async function apiRequireMemberAi(): Promise<MemberAiGate> {
  const session = await getSessionUser()
  if (!session) return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (session.role !== 'member') return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const member = await getMemberByUserId(session.userId)
  if (!member || !member.plan?.feature_ai || (!isOnboardingComplete(member) && !member.trading_override)) {
    return { ok: false, response: NextResponse.json({ error: 'ai_unavailable' }, { status: 403 }) }
  }
  return { ok: true, session, member, memberId: member.id }
}

export type StaffAiGate = { ok: true; session: SessionUser } | { ok: false; response: NextResponse }

export async function apiRequireStaffAi(): Promise<StaffAiGate> {
  const session = await getSessionUser()
  if (!session) return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (session.role === 'member') return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const allowed = canAccessWith(session.role, 'ai', await getRolePermissionOverrides())
  if (!allowed) return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { ok: true, session }
}
