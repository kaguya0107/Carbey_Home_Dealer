import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { FundingRow, FundingMethod } from '@/types/database'

/**
 * 資金調達（loan）の各ステップ定義。⑭画像に準拠。
 * actor: 'member' = 加盟店の操作で完了 / 'admin' = 本部承認で完了。
 */
export const LOAN_STEPS: { key: string; label: string; actor: 'member' | 'admin' }[] = [
  { key: 'apply', label: '資金調達申請', actor: 'member' },
  { key: 'hearing', label: 'ヒアリング', actor: 'admin' },
  { key: 'documents', label: '必要書類提出', actor: 'member' },
  { key: 'plan', label: '事業計画書作成', actor: 'member' },
  { key: 'bank_apply', label: '金融機関へ申請', actor: 'admin' },
  { key: 'review', label: '融資審査', actor: 'admin' },
  { key: 'contract', label: '融資契約', actor: 'admin' },
  { key: 'deposit', label: '着金確認', actor: 'admin' },
]

/** 加盟店の funding を取得（無ければ null）。 */
export async function getFunding(memberId: string): Promise<FundingRow | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('funding_applications')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle<FundingRow>()
  if (error) throw new Error(error.message)
  return data ?? null
}

/** user_id から自分の funding を取得（無ければ member 情報だけ返す）。 */
export async function getOwnFunding(userId: string): Promise<{ memberId: string; funding: FundingRow | null } | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!member) return null
  return { memberId: member.id, funding: await getFunding(member.id) }
}

async function resolveMemberId(userId: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!data) throw new Error('会員情報が紐付いていません')
  return data.id
}

/** 完了判定：self=本部確認済み / loan=全ステップ done。 */
function computeStatus(row: Pick<FundingRow, 'method' | 'self_confirmed' | 'step_status'>): 'in_progress' | 'completed' {
  if (row.method === 'self') return row.self_confirmed ? 'completed' : 'in_progress'
  if (row.method === 'loan') return LOAN_STEPS.every((s) => row.step_status?.[s.key] === 'done') ? 'completed' : 'in_progress'
  return 'in_progress'
}

/** 加盟店：資金の方法を選択（self/loan）。既存があれば method を更新。 */
export async function chooseMethod(userId: string, method: FundingMethod): Promise<void> {
  const supabase = createServiceRoleClient()
  const memberId = await resolveMemberId(userId)
  const { error } = await supabase
    .from('funding_applications')
    .upsert({ member_id: memberId, method, status: 'in_progress' } as never, { onConflict: 'member_id' })
  if (error) throw new Error(error.message)
}

/** 本部：資金準備の方法（分岐 self/loan）を選択・変更する（㊹ 選択式・可視化）。加盟店選択と同じ funding_applications を更新。 */
export async function setFundingMethodByAdmin(memberId: string, method: FundingMethod): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('funding_applications')
    .upsert({ member_id: memberId, method, status: 'in_progress' } as never, { onConflict: 'member_id' })
  if (error) throw new Error(error.message)
}

/** 加盟店：自己資金額を登録。 */
export async function setSelfAmount(userId: string, amount: number): Promise<void> {
  const supabase = createServiceRoleClient()
  const memberId = await resolveMemberId(userId)
  const { error } = await supabase
    .from('funding_applications')
    .upsert({ member_id: memberId, method: 'self', self_amount_yen: amount } as never, { onConflict: 'member_id' })
  if (error) throw new Error(error.message)
}

/** 加盟店：自分が担当する loan ステップを完了にする（actor='member' のみ）。 */
export async function completeMemberStep(userId: string, stepKey: string): Promise<void> {
  const step = LOAN_STEPS.find((s) => s.key === stepKey)
  if (!step || step.actor !== 'member') throw new Error('このステップは本部が進めます')

  const supabase = createServiceRoleClient()
  const memberId = await resolveMemberId(userId)
  const funding = await getFunding(memberId)
  if (!funding || funding.method !== 'loan') throw new Error('資金調達が選択されていません')

  // 順序ゲート：このステップより前が未完了なら拒否
  const idx = LOAN_STEPS.findIndex((s) => s.key === stepKey)
  for (let i = 0; i < idx; i++) {
    if (funding.step_status?.[LOAN_STEPS[i].key] !== 'done') throw new Error('前のステップが未完了です')
  }

  const next = { ...funding.step_status, [stepKey]: 'done' as const }
  const status = computeStatus({ method: 'loan', self_confirmed: funding.self_confirmed, step_status: next })
  const { error } = await supabase
    .from('funding_applications')
    .update({ step_status: next, status } as never)
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)
}

/** 本部：自己資金を確認する。 */
export async function confirmSelf(memberId: string, confirmed: boolean): Promise<void> {
  const supabase = createServiceRoleClient()
  const funding = await getFunding(memberId)
  if (!funding) throw new Error('資金情報がありません')
  const status = computeStatus({ method: funding.method, self_confirmed: confirmed, step_status: funding.step_status })
  const { error } = await supabase
    .from('funding_applications')
    .update({ self_confirmed: confirmed, status } as never)
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)
}

/** 本部：loan ステップの完了/取消（本部承認ステップ）。 */
export async function setAdminStep(memberId: string, stepKey: string, done: boolean): Promise<void> {
  const supabase = createServiceRoleClient()
  const funding = await getFunding(memberId)
  if (!funding) throw new Error('資金情報がありません')
  const next = { ...funding.step_status, [stepKey]: done ? ('done' as const) : ('todo' as const) }
  const status = computeStatus({ method: 'loan', self_confirmed: funding.self_confirmed, step_status: next })
  const { error } = await supabase
    .from('funding_applications')
    .update({ step_status: next, status } as never)
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)
}
