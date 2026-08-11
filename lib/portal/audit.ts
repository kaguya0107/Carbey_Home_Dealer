import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { AuditLogRow } from '@/types/database'

/**
 * 監査ログ（migration 048）。会員削除・復元など重要操作の証跡を残す。
 * 書き込みは service_role（サーバー）経由のみ。閲覧は本部スタッフ（RLS）。
 */
export async function writeAuditLog(input: {
  actorId: string | null
  actorName: string | null
  action: string
  targetType: string
  targetId?: string | null
  targetLabel?: string | null
  detail?: string | null
}): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: input.actorId,
    actor_name: input.actorName,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ?? null,
    detail: input.detail ?? null,
  } as never)
  if (error) throw new Error(error.message)
}

/** 特定対象の監査ログ（新しい順）。 */
export async function listAuditLogsForTarget(targetType: string, targetId: string, limit = 20): Promise<AuditLogRow[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as AuditLogRow[]
}

/** 全体の監査ログ（新しい順）。 */
export async function listAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as AuditLogRow[]
}
