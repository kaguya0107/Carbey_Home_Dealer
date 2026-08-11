import { createServiceRoleClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/portal/audit'
import type { MemberRow, MemberInsert, PaymentRow, PlanRow } from '@/types/database'

/**
 * 会員(加盟店)データアクセス。本部管理画面用。
 * 呼び出し側で requireStaff 済みであること (service-role は RLS バイパス)。
 */

export type MemberWithPlan = MemberRow & { plan: Pick<PlanRow, 'code' | 'name' | 'default_auto_slots' | 'feature_ai' | 'feature_crm'> | null }

export type MemberFilter = {
  q?: string // name/email/company 部分一致
  status?: string
  plan_id?: string
  /** ソフト削除済みも含める（既定 false=有効な会員のみ）。 */
  includeDeleted?: boolean
}

export async function listMembers(filter: MemberFilter = {}): Promise<MemberWithPlan[]> {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('members')
    .select('*, plan:plans(code, name, default_auto_slots, feature_ai, feature_crm)')
    .order('created_at', { ascending: false })

  if (!filter.includeDeleted) query = query.is('deleted_at', null) // 削除済みは一覧から除外（migration 048）
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.plan_id) query = query.eq('plan_id', filter.plan_id)
  if (filter.q) {
    const q = `%${filter.q}%`
    query = query.or(`member_name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MemberWithPlan[]
}

/** ソフト削除済みの会員一覧（復元用・削除日の新しい順）。 */
export async function listDeletedMembers(): Promise<MemberWithPlan[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .select('*, plan:plans(code, name, default_auto_slots, feature_ai, feature_crm)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MemberWithPlan[]
}

type Actor = { id: string | null; name: string | null }

/** 会員をソフト削除（deleted_at をセット）。物理削除せず、一覧から除外する。監査ログを残す。 */
export async function softDeleteMember(id: string, actor: Actor): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: m } = await supabase
    .from('members')
    .select('company_name, member_name, deleted_at')
    .eq('id', id)
    .maybeSingle<{ company_name: string | null; member_name: string; deleted_at: string | null }>()
  if (!m) throw new Error('会員が見つかりません')
  if (m.deleted_at) throw new Error('すでに削除済みです')
  const { error } = await supabase
    .from('members')
    .update({ deleted_at: new Date().toISOString(), deleted_by: actor.id } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
  await writeAuditLog({
    actorId: actor.id, actorName: actor.name,
    action: 'member.delete', targetType: 'member', targetId: id,
    targetLabel: m.company_name ?? m.member_name,
    detail: '会員登録を削除（ソフト削除・一覧非表示／入出金・同意などの記録は保全）',
  })
}

/** ソフト削除した会員を復元（deleted_at を NULL に戻す）。監査ログを残す。 */
export async function restoreMember(id: string, actor: Actor): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: m } = await supabase
    .from('members')
    .select('company_name, member_name, deleted_at')
    .eq('id', id)
    .maybeSingle<{ company_name: string | null; member_name: string; deleted_at: string | null }>()
  if (!m) throw new Error('会員が見つかりません')
  if (!m.deleted_at) throw new Error('削除されていません')
  const { error } = await supabase
    .from('members')
    .update({ deleted_at: null, deleted_by: null } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
  await writeAuditLog({
    actorId: actor.id, actorName: actor.name,
    action: 'member.restore', targetType: 'member', targetId: id,
    targetLabel: m.company_name ?? m.member_name,
    detail: '会員登録を復元',
  })
}

export async function getMember(id: string): Promise<MemberWithPlan | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .select('*, plan:plans(code, name, default_auto_slots, feature_ai, feature_crm)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as MemberWithPlan) ?? null
}

/**
 * 同じメールアドレスの会員が既に存在するか（1メール=1会員のため重複を防ぐ）。
 * excludeId を渡すと自分自身は除外（編集時に使用）。大文字小文字は無視。
 */
export async function findMemberByEmail(email: string, excludeId?: string): Promise<{ id: string; member_name: string } | null> {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('members')
    .select('id, member_name')
    .ilike('email', email)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query.limit(1).maybeSingle<{ id: string; member_name: string }>()
  if (error) throw new Error(error.message)
  return data ?? null
}

export async function createMember(input: MemberInsert): Promise<MemberRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .insert(input as never)
    .select('*')
    .single<MemberRow>()
  if (error) throw new Error(error.message)
  return data
}

export async function updateMember(id: string, patch: Partial<MemberInsert>): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('members').update(patch as never).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * 加盟店本人による自己更新。user_id でスコープし、本人の行のみ更新する。
 * 呼び出し側で連絡先系フィールドのみに patch を絞ること (契約・財務・ステータスは本部専用)。
 */
export async function updateOwnMember(userId: string, patch: Partial<MemberInsert>): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('members').update(patch as never).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function listPayments(memberId: string): Promise<PaymentRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('member_id', memberId)
    .order('payment_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PaymentRow[]
}

/** member.user_id から自分の会員レコードを取得 (member 側ダッシュボード用)。 */
export async function getMemberByUserId(userId: string): Promise<MemberWithPlan | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('members')
    .select('*, plan:plans(code, name, default_auto_slots, feature_ai, feature_crm)')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as MemberWithPlan) ?? null
}
