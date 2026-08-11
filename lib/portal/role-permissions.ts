import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { EDITABLE_ROLES, FEATURES, permKey, canAccess, type Feature } from '@/lib/auth/permissions'
import type { UserRole } from '@/types/database'

/**
 * 権限マトリクスの上書き（migration 057）を読み込む。Map<`role:feature`, boolean>。
 * リクエスト内で複数回呼ばれても1回だけ問い合わせる（React cache）。
 */
export const getRolePermissionOverrides = cache(async (): Promise<Map<string, boolean>> => {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('role_permissions').select('role, feature, allowed')
  const map = new Map<string, boolean>()
  for (const r of (data ?? []) as { role: string; feature: string; allowed: boolean }[]) {
    map.set(`${r.role}:${r.feature}`, r.allowed)
  }
  return map
})

/** 1件の上書きを保存（本部）。編集可能ロールのみ。 */
export async function setRolePermission(role: UserRole, feature: Feature, allowed: boolean): Promise<void> {
  if (!EDITABLE_ROLES.includes(role)) throw new Error('このロールの権限は編集できません。')
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('role_permissions')
    .upsert({ role, feature, allowed, updated_at: new Date().toISOString() } as never, { onConflict: 'role,feature' })
  if (error) throw new Error(error.message)
}

/**
 * 編集可能ロール×全機能の可否をまとめて保存（本部・マトリクス一括保存）。
 * allowedMap のキーは `role:feature`。含まれない編集セルは false（不可）とみなす。
 */
export async function saveRolePermissions(allowedMap: Map<string, boolean>): Promise<void> {
  const supabase = createServiceRoleClient()
  const rows: { role: string; feature: string; allowed: boolean; updated_at: string }[] = []
  const now = new Date().toISOString()
  for (const role of EDITABLE_ROLES) {
    for (const feature of FEATURES) {
      rows.push({ role, feature, allowed: allowedMap.get(permKey(role, feature)) ?? false, updated_at: now })
    }
  }
  const { error } = await supabase.from('role_permissions').upsert(rows as never, { onConflict: 'role,feature' })
  if (error) throw new Error(error.message)
}

/** 表示用：編集可能ロールの現在の実効可否（上書き→無ければ既定）。 */
export function effectiveAllowed(role: UserRole, feature: Feature, overrides: Map<string, boolean>): boolean {
  const ov = overrides.get(permKey(role, feature))
  return ov !== undefined ? ov : canAccess(role, feature)
}
