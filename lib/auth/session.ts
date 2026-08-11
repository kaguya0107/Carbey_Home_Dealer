import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createClient, createAuthClient } from '@/lib/supabase/server'
import type { UserRole, PortalUserRow } from '@/types/database'
import { canAccess, canAccessWith, type Feature } from '@/lib/auth/permissions'
import { getRolePermissionOverrides } from '@/lib/portal/role-permissions'

export type SessionUser = {
  userId: string
  email: string | null
  role: UserRole
  name: string | null
}

type PortalUserPick = Pick<PortalUserRow, 'role' | 'name' | 'email'>

/** 本部スタッフ (管理者 / CRM入力担当 / チャット専用) か? = 加盟店以外 */
export function isStaff(role: UserRole): boolean {
  return role === 'admin' || role === 'crm_staff' || role === 'chat_only'
}

/**
 * 現在のユーザーと portal.users のロールを解決する。
 * 未認証 or portal.users 未登録なら null。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const auth = await createAuthClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('role, name, email')
    .eq('id', user.id)
    .maybeSingle<PortalUserPick>()

  if (!data) return null

  return {
    userId: user.id,
    email: user.email ?? data.email ?? null,
    role: data.role,
    name: data.name,
  }
}

// ---------------------------------------------------------------------
// Server Component / Page 用ガード (リダイレクト)
// ---------------------------------------------------------------------

export async function requireSession(): Promise<SessionUser> {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  return session
}

/** 管理者(本部)のみ。 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession()
  if (session.role !== 'admin') redirect('/login?error=forbidden')
  return session
}

/** 本部スタッフ (管理者/CRM入力担当/チャット専用)。 */
export async function requireStaff(): Promise<SessionUser> {
  const session = await requireSession()
  if (!isStaff(session.role)) redirect('/login?error=forbidden')
  return session
}

/** 加盟店。 */
export async function requireMember(): Promise<SessionUser> {
  const session = await requireSession()
  if (session.role !== 'member') redirect('/login?error=forbidden')
  return session
}

/** 機能アクセス権でガード (permission matrix + 本部の上書き 準拠)。 */
export async function requireFeature(feature: Feature): Promise<SessionUser> {
  const session = await requireSession()
  // 管理者・加盟店は上書き対象外なので既定で即判定。編集可能ロールのみ上書きを反映。
  const allowed = session.role === 'admin' || session.role === 'member'
    ? canAccess(session.role, feature)
    : canAccessWith(session.role, feature, await getRolePermissionOverrides())
  if (!allowed) redirect('/login?error=forbidden')
  return session
}

// ---------------------------------------------------------------------
// Route Handler 用ガード (JSON レスポンス)
// ---------------------------------------------------------------------

export type ApiGate = { ok: true; session: SessionUser } | { ok: false; response: NextResponse }

export async function apiRequireSession(): Promise<ApiGate> {
  const session = await getSessionUser()
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, session }
}

export async function apiRequireStaff(): Promise<ApiGate> {
  const gate = await apiRequireSession()
  if (!gate.ok) return gate
  if (!isStaff(gate.session.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return gate
}
