import { createServiceRoleClient } from '@/lib/supabase/admin'
import { assertTradingAllowed } from '@/lib/portal/trading'
import { getOwnOnboarding } from '@/lib/portal/onboarding'
import { getOwnFlow } from '@/lib/portal/flow'
import { getFlowBudgets } from '@/lib/portal/budget'
import { createDealFromOrder, recordDeletedDeal } from '@/lib/portal/deals'
import type { VehicleDealRow } from '@/types/database'
import { notifyMember } from '@/lib/portal/notifications'
import type { OrderRow, OrderStatus } from '@/types/database'

/**
 * ㉜ STEP5：オーダーのオンボーディング完了ゲート（㉚）の有効/無効。
 * クライアント要望「今回はオーダー権限を解放、次回は制限をかけて再確認」に対応。
 * 前回は解放（false）で確認済み。今回、要件（5.3 ロック制御・論点B）どおり
 * 「オンボーディング完了までオーダー不可」を再度有効化する（true）。
 */
export const ORDER_ONBOARDING_GATE = true

export type OrderWithMember = OrderRow & {
  member: { id: string; member_name: string; company_name: string | null } | null
}

/**
 * ㉕ 本部が「オンボーディング未完了でも取引を許可」した加盟店か。
 * 古物商猶予の超過ロックはこの特例では解除されない（assertTradingAllowed 側で判定）。
 */
export async function hasTradingOverride(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('members')
    .select('trading_override')
    .eq('user_id', userId)
    .maybeSingle<{ trading_override: boolean }>()
  return !!data?.trading_override
}

/** 全オーダー（本部）。加盟店名を結合。status / memberId で絞り込み可。 */
export async function listOrders(filter?: { status?: OrderStatus; memberId?: string }): Promise<OrderWithMember[]> {
  const supabase = createServiceRoleClient()
  let q = supabase
    .from('orders')
    .select('*, member:members(id, member_name, company_name)')
    .order('created_at', { ascending: false })
  if (filter?.status) q = q.eq('status', filter.status)
  if (filter?.memberId) q = q.eq('member_id', filter.memberId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OrderWithMember[]
}

export type OrderSummary = { total: number; received: number; in_progress: number; completed: number; cancelled: number }

/** 加盟店ごとのオーダー件数サマリ（本部・会員個別画面用）。 */
export async function getMemberOrderSummary(memberId: string): Promise<OrderSummary> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('orders')
    .select('status')
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { status: OrderStatus }[]
  const s: OrderSummary = { total: rows.length, received: 0, in_progress: 0, completed: 0, cancelled: 0 }
  for (const r of rows) s[r.status]++
  return s
}

/** member.user_id から自分のオーダー一覧（加盟店）。 */
export async function listOwnOrders(userId: string): Promise<OrderRow[]> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string }>()
  if (!member) return []
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('member_id', member.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OrderRow[]
}

/** 単一オーダー（本部）。 */
export async function getOrder(id: string): Promise<OrderWithMember | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, member:members(id, member_name, company_name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as OrderWithMember) ?? null
}

/** member.user_id を解決して自分のオーダーを作成（加盟店）。 */
export async function createOwnOrder(
  userId: string,
  input: Pick<OrderRow, 'maker' | 'car_model' | 'year' | 'budget_yen' | 'preferred_color' | 'mileage_max' | 'notes'>,
): Promise<OrderRow> {
  // ㉚ オンボーディング完了ゲート（要件定義書 論点B：未完了はオーダー不可）
  // ㉜ STEP5：前回は解放して確認済み。現在は要件どおり有効（ORDER_ONBOARDING_GATE=true）。
  // ㉕ 本部が特例で許可（trading_override）していれば未完了でもオーダー可。
  if (ORDER_ONBOARDING_GATE && !(await hasTradingOverride(userId))) {
    const onboarding = await getOwnOnboarding(userId)
    if (!onboarding?.unlocked) {
      throw new Error('オンボーディングが完了していません。すべてのステップを完了すると仕入れオーダーを作成できます。')
    }
  }

  // ㉙ オーダーフォームは半自動売買モデルの運用。自動売買フローでは手動オーダー不可。
  const flowInfo = await getOwnFlow(userId)
  if (flowInfo && flowInfo.flow !== 'semi') {
    throw new Error('自動売買フローでは仕入れは自動化されます（手動オーダーは半自動売買フローでのみ利用できます）。')
  }

  // 取引可否ガード：古物商猶予の超過中は発注不可（自動発注の事故防止）
  await assertTradingAllowed(userId)

  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string }>()
  if (!member) throw new Error('会員情報が紐付いていません')

  // フェーズ2 超過オーダー制限：発注金額（予算）は預かり残高より低いこと。
  //   仕入資金を超えるオーダーを禁止（自動精算の前提）。
  //   フェーズ7：両フロー保有者は「半自動用」の割当額で判定（単独フローは預かり残高全額）。
  const budgets = await getFlowBudgets(member.id)
  const balance = budgets.semiBudget
  const orderAmount = input.budget_yen ?? 0
  if (!orderAmount || orderAmount <= 0) {
    throw new Error('予算（発注金額）を入力してください。')
  }
  if (orderAmount >= balance) {
    const label = budgets.isDual && budgets.hasAllocation ? '半自動用の予算' : '仕入れ資金の預かり残高'
    throw new Error(`発注金額（${orderAmount.toLocaleString()}円）が${label}（${balance.toLocaleString()}円）を超えています。残高の範囲内でオーダーしてください。`)
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({ ...input, member_id: member.id } as never)
    .select('*')
    .single<OrderRow>()
  if (error) throw new Error(error.message)

  // #24 オーダー送信時点では「承認待ち」。案件（仕入れ）は本部の承認時に生成する。
  return data
}

/**
 * #39 オーダーに紐づく車両案件を削除し、台帳（精算・ロイヤリティ）も戻す。
 * オーダーをキャンセルした際に、売上・利益・預かり金の整合を保つ（「キャンセルなのに利益が残る」を防ぐ）。
 */
async function purgeOrderDeals(orderId: string, reason: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: deals } = await supabase.from('vehicle_deals').select('*').eq('order_id', orderId)
  for (const d of (deals ?? []) as unknown as VehicleDealRow[]) {
    await recordDeletedDeal(d, { reason }) // ㊸ 削除前に記録保全
    await supabase.from('ledger_entries').delete().eq('deal_id', d.id) // 精算・ロイヤリティ等を戻す（残高はトリガで再計算）
  }
  await supabase.from('vehicle_deals').delete().eq('order_id', orderId)
}

/** オーダーのステータスを変更（本部）。 */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const supabase = createServiceRoleClient()
  // #39 キャンセルにするときは、紐づく案件（売却済み含む）を削除し売上・利益を戻す。矛盾状態を作らない。
  if (status === 'cancelled') await purgeOrderDeals(id, 'オーダーのキャンセルに連動')
  const { error } = await supabase.from('orders').update({ status } as never).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * #24 本部が仕入れオーダーを承認する（承認待ち → 承認済み・対応中）。
 * 承認で車両案件（vehicle_deal）を生成し「仕入れ中」に進める。既に案件があれば二重生成しない。加盟店へ通知。
 */
export async function approveOrder(id: string, by: string | null): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: o } = await supabase.from('orders').select('*').eq('id', id).maybeSingle<OrderRow>()
  if (!o) throw new Error('オーダーが見つかりません')
  if (o.status !== 'received') throw new Error('承認待ちのオーダーのみ承認できます。')
  // 案件がまだ無ければ生成（承認＝仕入れ開始）
  const { count } = await supabase.from('vehicle_deals').select('id', { count: 'exact', head: true }).eq('order_id', id)
  if (!count) await createDealFromOrder(o)
  const { error } = await supabase.from('orders').update({ status: 'in_progress', approved_at: new Date().toISOString(), approved_by: by } as never).eq('id', id)
  if (error) throw new Error(error.message)
  await notifyMember(o.member_id, 'order', '仕入れオーダーが承認されました', `オーダー ${o.order_number ?? ''} を承認しました。仕入れを進めます。`)
}

/**
 * #24 本部が仕入れオーダーを非承認にする（→キャンセル＋理由）。
 * 生成済みの案件（vehicle_deal）は削除して仕入れを止める。理由を加盟店へ通知。
 */
export async function rejectOrder(id: string, by: string | null, reason: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: o } = await supabase.from('orders').select('member_id, status, order_number').eq('id', id).maybeSingle<{ member_id: string; status: OrderStatus; order_number: string | null }>()
  if (!o) throw new Error('オーダーが見つかりません')
  if (o.status !== 'received' && o.status !== 'in_progress') throw new Error('承認待ち・対応中のオーダーのみ非承認にできます。')
  const { error } = await supabase.from('orders').update({ status: 'cancelled', reject_reason: reason || null, approved_by: by } as never).eq('id', id)
  if (error) throw new Error(error.message)
  // 生成済みの案件を削除（仕入れを止める）＋台帳も戻す（#39 整合）
  await purgeOrderDeals(id, 'オーダーの非承認に連動')
  await notifyMember(o.member_id, 'order', '仕入れオーダーが非承認になりました', `オーダー ${o.order_number ?? ''} は承認されませんでした。${reason ? `理由：${reason}` : ''}`)
}

/** ステータス別の件数（ダッシュボード用）。 */
export async function orderStatusCounts(): Promise<Record<OrderStatus, number> & { total: number }> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('orders').select('status')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { status: OrderStatus }[]
  const counts = { received: 0, in_progress: 0, completed: 0, cancelled: 0, total: rows.length }
  for (const r of rows) counts[r.status]++
  return counts
}
