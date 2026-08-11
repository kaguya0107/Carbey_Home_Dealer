import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { PortalUserRow, UserRole, UserStatus } from '@/types/database'

/** 本部スタッフ (member 以外のロール) の一覧。権限管理画面で使用。 */
export async function listStaff(): Promise<PortalUserRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .neq('role', 'member')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PortalUserRow[]
}

/** ユーザーのロールを変更する (本部スタッフのロール割り当て)。 */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('users').update({ role } as never).eq('id', userId)
  if (error) throw new Error(error.message)
}

/** ユーザーの利用状態 (有効/停止) を変更する。 */
export async function updateUserStatus(userId: string, status: UserStatus): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('users').update({ status } as never).eq('id', userId)
  if (error) throw new Error(error.message)
}

/** 現在の admin の人数 (最後の管理者を降格させない安全弁に使う)。 */
export async function countAdmins(): Promise<number> {
  const supabase = createServiceRoleClient()
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  if (error) throw new Error(error.message)
  return count ?? 0
}
