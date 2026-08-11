import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getLedgerBalance, addLedgerEntry } from '@/lib/portal/ledger'
import { notifyMember, notifyAdmin } from '@/lib/portal/notifications'
import { getSettingsMap } from '@/lib/portal/settings'
import type { WithdrawalRequestRow, WithdrawalStatus, MemberStatus } from '@/types/database'

/**
 * 運転資金の出金（引き出し／ウィズドロー）。
 * チケットモデルは 2026-07-26 クライアント確定（#8・migration 047）:
 *
 *   ・オーダー中／仕入れ中の案件があると申請不可（自動売買・半自動売買の両方）
 *   ・申請から入金までは最大14日以内（設定値 withdrawal_due_days）
 *   ・契約年ごとに無料枠 1枚（設定値 withdrawal_free_per_year）。初回は無料。
 *   ・2回目以降は「チケット代 5,000円（設定値 withdrawal_ticket_price_yen）」を
 *     "預かり金から"償却する。会員は申請額を満額受け取る（手数料を差し引かない）。
 *   ・預かり金がチケット代を下回る場合は出金不可。
 *   ・未処理（申請中／承認済）の申請がある間は新規申請不可（多重申請の防止）
 *
 * withdrawal_requests の列の意味（migration 047 で流用）:
 *   fee_yen … その申請のチケット代（無料=0／購入=ticketPriceYen）
 *   net_yen … 実際の振込額（= amount_yen。満額）
 */

export type WithdrawalSettings = {
  ticketPriceYen: number  // 2回目以降のチケット代（預かり金から償却）
  dueDays: number
  freePerYear: number     // 契約年あたりの無料枠
  minYen: number
}

const DEFAULTS: WithdrawalSettings = { ticketPriceYen: 5000, dueDays: 14, freePerYear: 1, minYen: 0 }

export async function getWithdrawalSettings(): Promise<WithdrawalSettings> {
  const map = await getSettingsMap()
  return {
    ticketPriceYen: map.get('withdrawal_ticket_price_yen') ?? DEFAULTS.ticketPriceYen,
    dueDays: map.get('withdrawal_due_days') ?? DEFAULTS.dueDays,
    freePerYear: map.get('withdrawal_free_per_year') ?? DEFAULTS.freePerYear,
    minYen: map.get('withdrawal_min_yen') ?? DEFAULTS.minYen,
  }
}

export async function setWithdrawalSetting(
  key: 'withdrawal_ticket_price_yen' | 'withdrawal_due_days' | 'withdrawal_free_per_year' | 'withdrawal_min_yen',
  value: number,
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('system_settings').upsert({ key, value_int: Math.max(0, Math.round(value)) } as never, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/**
 * 契約日起算の「今の契約年度」の開始日を返す（チケットの集計期間）。
 * 契約日が未設定なら登録日を使う。どちらも無ければ null。
 */
export function contractYearStart(contractDate: string | null, registrationDate: string | null, now = new Date()): string | null {
  const base = contractDate ?? registrationDate
  if (!base) return null
  const b = new Date(base + 'T00:00:00Z')
  if (Number.isNaN(b.getTime())) return null
  let year = now.getUTCFullYear()
  const anniv = () => new Date(Date.UTC(year, b.getUTCMonth(), b.getUTCDate()))
  if (anniv().getTime() > now.getTime()) year -= 1
  const start = anniv()
  return start.toISOString().slice(0, 10)
}

export type WithdrawalEligibility = {
  canRequest: boolean
  reasons: string[]           // 申請できない理由（複数）
  balance: number             // 預かり金残高
  availableAmount: number     // 申請可能な上限額（チケット代を差し引いた残り）
  ticketPriceYen: number      // 2回目以降のチケット代
  dueDays: number
  minYen: number
  freePerYear: number         // 契約年あたりの無料枠
  freeUsedThisYear: number    // 今年度に使った無料枠
  freeLeftThisYear: number    // 今年度の無料枠残
  nextIsFree: boolean         // 次の申請が無料枠で行えるか
  ticketChargeForNext: number // 次の申請に発生するチケット代（0 or ticketPriceYen）
  yearStart: string | null
  blockingOrders: number      // オーダー中の件数
  blockingDeals: number       // 仕入れ中（オーダー含む）の件数
  pendingRequest: WithdrawalRequestRow | null
  bankRegistered: boolean
}

/** 出金申請の可否を判定する（ロック条件をすべて評価）。 */
export async function getWithdrawalEligibility(memberId: string): Promise<WithdrawalEligibility> {
  const supabase = createServiceRoleClient()
  const s = await getWithdrawalSettings()

  const { data: m } = await supabase
    .from('members')
    .select('status, contract_date, registration_date, bank_name, bank_account_number, bank_account_holder')
    .eq('id', memberId)
    .maybeSingle<{ status: MemberStatus; contract_date: string | null; registration_date: string | null; bank_name: string | null; bank_account_number: string | null; bank_account_holder: string | null }>()

  const balance = await getLedgerBalance(memberId)

  // オーダー中（受付中／対応中）
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .in('status', ['received', 'in_progress'])

  // 仕入れ中（車両オーダー／仕入れ中）— 自動売買・半自動の両方
  const { count: dealCount } = await supabase
    .from('vehicle_deals')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .in('status', ['ordered', 'sourcing'])

  // 未処理の申請（多重申請の防止）
  const { data: pending } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .eq('member_id', memberId)
    .in('status', ['requested', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<WithdrawalRequestRow>()

  // 今年度の出金回数（契約年度内の 申請中／承認済／振込完了）。無料枠の消費数に相当。
  const yearStart = contractYearStart(m?.contract_date ?? null, m?.registration_date ?? null)
  let usedThisYear = 0
  if (yearStart) {
    const { count } = await supabase
      .from('withdrawal_requests')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .in('status', ['requested', 'approved', 'paid'])
      .gte('requested_at', yearStart)
    usedThisYear = count ?? 0
  }
  const freeUsedThisYear = Math.min(usedThisYear, s.freePerYear)
  const freeLeftThisYear = Math.max(0, s.freePerYear - usedThisYear)
  const nextIsFree = usedThisYear < s.freePerYear
  const ticketChargeForNext = nextIsFree ? 0 : s.ticketPriceYen
  // チケット代も預かり金から引くため、申請できる上限は残高からチケット代を差し引いた額
  const availableAmount = Math.max(0, balance - ticketChargeForNext)

  const blockingOrders = orderCount ?? 0
  const blockingDeals = dealCount ?? 0
  const bankRegistered = !!(m?.bank_name && m?.bank_account_number && m?.bank_account_holder)

  const reasons: string[] = []
  if (!m) reasons.push('会員情報が見つかりません')
  if (m && m.status !== 'active') reasons.push('契約が有効な状態ではありません（契約期間をご確認ください）')
  if (blockingOrders > 0) reasons.push(`オーダー中の案件が${blockingOrders}件あります（完了後に申請できます）`)
  if (blockingDeals > 0) reasons.push(`仕入れ中の案件が${blockingDeals}件あります（完了後に申請できます）`)
  if (pending) reasons.push('未処理の出金申請があります（1件ずつのお手続きとなります）')
  if (!bankRegistered) reasons.push('振込先口座が未登録です（本部までご連絡ください）')
  if (ticketChargeForNext > 0 && balance < s.ticketPriceYen) {
    reasons.push(`預かり金がチケット代（${s.ticketPriceYen.toLocaleString()}円）を下回っています`)
  } else if (availableAmount <= 0) {
    reasons.push('出金可能な残高がありません')
  }

  return {
    canRequest: reasons.length === 0,
    reasons, balance, availableAmount,
    ticketPriceYen: s.ticketPriceYen, dueDays: s.dueDays, minYen: s.minYen, freePerYear: s.freePerYear,
    freeUsedThisYear, freeLeftThisYear, nextIsFree, ticketChargeForNext, yearStart,
    blockingOrders, blockingDeals, pendingRequest: pending ?? null, bankRegistered,
  }
}

/** ユーザーIDから自分の出金可否を取得（加盟店画面）。 */
export async function getOwnWithdrawalEligibility(userId: string): Promise<{ memberId: string; eligibility: WithdrawalEligibility } | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!member) return null
  return { memberId: member.id, eligibility: await getWithdrawalEligibility(member.id) }
}

/** 出金を申請する（加盟店）。ロック条件をすべて満たす場合のみ受け付ける。 */
export async function requestWithdrawal(memberId: string, amountYen: number): Promise<void> {
  const supabase = createServiceRoleClient()
  const e = await getWithdrawalEligibility(memberId)
  if (!e.canRequest) throw new Error(e.reasons[0] ?? '現在は出金申請できません。')

  const amount = Math.round(amountYen)
  const ticketCharge = e.ticketChargeForNext
  if (!amount || amount <= 0) throw new Error('出金額を入力してください。')
  if (e.minYen > 0 && amount < e.minYen) throw new Error(`最低出金額は ${e.minYen.toLocaleString()}円 です。`)
  // 会員は満額受取。チケット代も預かり金から引くため、合計が残高を超えないこと。
  if (amount + ticketCharge > e.balance) {
    const tail = ticketCharge > 0 ? `とチケット代（${ticketCharge.toLocaleString()}円）` : ''
    throw new Error(`預かり金残高（${e.balance.toLocaleString()}円）では、この金額${tail}を差し引けません。`)
  }

  const { data: m } = await supabase
    .from('members')
    .select('member_name, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder')
    .eq('id', memberId)
    .maybeSingle<{ member_name: string; bank_name: string | null; bank_branch: string | null; bank_account_type: string | null; bank_account_number: string | null; bank_account_holder: string | null }>()

  const due = new Date()
  due.setDate(due.getDate() + e.dueDays)

  const { error } = await supabase.from('withdrawal_requests').insert({
    member_id: memberId,
    status: 'requested',
    amount_yen: amount,
    fee_yen: ticketCharge, // チケット代（無料枠=0／購入=ticketPriceYen）
    net_yen: amount,       // 満額振込（手数料は差し引かない）
    bank_name: m?.bank_name ?? null,
    bank_branch: m?.bank_branch ?? null,
    bank_account_type: m?.bank_account_type ?? null,
    bank_account_number: m?.bank_account_number ?? null,
    bank_account_holder: m?.bank_account_holder ?? null,
    due_date: due.toISOString().slice(0, 10),
  } as never)
  if (error) throw new Error(error.message)

  const ticketNote = ticketCharge > 0 ? `（チケット代 ${ticketCharge.toLocaleString()}円）` : '（無料枠）'
  await notifyAdmin('withdrawal', '出金申請が届きました', `${m?.member_name ?? ''} 様より ${amount.toLocaleString()}円の出金申請がありました${ticketNote}。`)
}

/** 申請を承認する（本部）。振込待ちになる。 */
export async function approveWithdrawal(id: string, by: string | null): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: r } = await supabase.from('withdrawal_requests').select('member_id, status, net_yen, due_date').eq('id', id).maybeSingle<Pick<WithdrawalRequestRow, 'member_id' | 'status' | 'net_yen' | 'due_date'>>()
  if (!r) throw new Error('申請が見つかりません')
  if (r.status !== 'requested') throw new Error('申請中の出金のみ承認できます。')
  const { error } = await supabase.from('withdrawal_requests').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: by } as never).eq('id', id)
  if (error) throw new Error(error.message)
  await notifyMember(r.member_id, 'withdrawal', '出金申請を承認しました', `振込額 ${r.net_yen.toLocaleString()}円。${r.due_date ? `${r.due_date} までにお振込みします。` : ''}`)
}

/** 申請を却下する（本部）。 */
export async function rejectWithdrawal(id: string, by: string | null, reason: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: r } = await supabase.from('withdrawal_requests').select('member_id, status').eq('id', id).maybeSingle<{ member_id: string; status: WithdrawalStatus }>()
  if (!r) throw new Error('申請が見つかりません')
  if (r.status === 'paid') throw new Error('振込完了済みの申請は却下できません。')
  const { error } = await supabase.from('withdrawal_requests').update({ status: 'rejected', reject_reason: reason || null, approved_by: by } as never).eq('id', id)
  if (error) throw new Error(error.message)
  await notifyMember(r.member_id, 'withdrawal', '出金申請が却下されました', reason || '詳細は本部までお問い合わせください。')
}

/**
 * 振込完了を記録する（本部）。預かり金台帳から「振込額（満額）＋チケット代」を減算する。
 * 会員は net_yen（= amount_yen・満額）を受け取り、チケット代 fee_yen は本部の徴収分として
 * 同時に預かり金から差し引く（合計 amount_yen ＋ fee_yen）。
 */
export async function markWithdrawalPaid(id: string, by: string | null): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: r } = await supabase.from('withdrawal_requests').select('*').eq('id', id).maybeSingle<WithdrawalRequestRow>()
  if (!r) throw new Error('申請が見つかりません')
  if (r.status !== 'approved') throw new Error('承認済みの出金のみ振込完了にできます。')

  const totalDeduct = r.amount_yen + r.fee_yen // 出金（満額）＋チケット代
  const balance = await getLedgerBalance(r.member_id)
  if (balance < totalDeduct) throw new Error(`預かり金残高（${balance.toLocaleString()}円）が出金額＋チケット代（${totalDeduct.toLocaleString()}円）を下回っています。`)

  await addLedgerEntry({
    memberId: r.member_id,
    kind: 'withdraw',
    amount: totalDeduct,
    note: r.fee_yen > 0
      ? `出金 ${r.amount_yen.toLocaleString()}円／チケット代 ${r.fee_yen.toLocaleString()}円`
      : `出金 ${r.amount_yen.toLocaleString()}円（無料枠）`,
    createdBy: by,
  })
  const { error } = await supabase.from('withdrawal_requests').update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: by } as never).eq('id', id)
  if (error) throw new Error(error.message)
  const feeNote = r.fee_yen > 0 ? `／チケット代 ${r.fee_yen.toLocaleString()}円` : ''
  await notifyMember(r.member_id, 'withdrawal', '出金の振込が完了しました', `振込額 ${r.net_yen.toLocaleString()}円${feeNote}。預かり金から ${totalDeduct.toLocaleString()}円を差し引きました。`)
}

/**
 * 本部が出金申請を取り消す（#22）。振込完了前（申請中／承認済み）なら取消可能。
 * approved でも台帳減算は markPaid 時のため、取消で預かり金を戻す処理は不要。
 */
export async function adminCancelWithdrawal(id: string, by: string | null): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: r } = await supabase.from('withdrawal_requests').select('member_id, status').eq('id', id).maybeSingle<{ member_id: string; status: WithdrawalStatus }>()
  if (!r) throw new Error('申請が見つかりません')
  if (r.status === 'paid') throw new Error('振込完了済みの申請は取り消せません。')
  if (r.status !== 'requested' && r.status !== 'approved') throw new Error('申請中／承認済みの出金のみ取り消せます。')
  const { error } = await supabase.from('withdrawal_requests').update({ status: 'cancelled', approved_by: by } as never).eq('id', id)
  if (error) throw new Error(error.message)
  await notifyMember(r.member_id, 'withdrawal', '出金申請が取り消されました', '本部により出金申請が取り消されました。ご不明点は本部までお問い合わせください。')
}

/** 加盟店が自分の申請を取り消す（承認前のみ）。 */
export async function cancelWithdrawal(id: string, memberId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: r } = await supabase.from('withdrawal_requests').select('member_id, status').eq('id', id).maybeSingle<{ member_id: string; status: WithdrawalStatus }>()
  if (!r) throw new Error('申請が見つかりません')
  if (r.member_id !== memberId) throw new Error('権限がありません')
  if (r.status !== 'requested') throw new Error('承認前の申請のみ取り消せます。')
  const { error } = await supabase.from('withdrawal_requests').update({ status: 'cancelled' } as never).eq('id', id)
  if (error) throw new Error(error.message)
}

export type WithdrawalWithMember = WithdrawalRequestRow & {
  member: { id: string; member_name: string; company_name: string | null } | null
}

/** 本部：全加盟店の出金申請（状態で絞り込み可）。 */
export async function listAllWithdrawals(status?: WithdrawalStatus): Promise<WithdrawalWithMember[]> {
  const supabase = createServiceRoleClient()
  let q = supabase.from('withdrawal_requests').select('*, member:members(id, member_name, company_name)').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as WithdrawalWithMember[]
}

/** 加盟店：自分の出金申請履歴。 */
export async function listWithdrawals(memberId: string): Promise<WithdrawalRequestRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('withdrawal_requests').select('*').eq('member_id', memberId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as WithdrawalRequestRow[]
}

/** 振込用CSV（承認済み＝振込待ちの一覧）。Excel で開けるよう BOM 付き。 */
export function buildWithdrawalCsv(rows: WithdrawalWithMember[]): string {
  const head = ['申請日', '加盟店名', '金融機関', '支店', '種別', '口座番号', '口座名義', '振込額', 'チケット代', '申請額', '入金期限']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) => [
    r.requested_at?.slice(0, 10) ?? '',
    r.member?.company_name || r.member?.member_name || '',
    r.bank_name ?? '', r.bank_branch ?? '', r.bank_account_type ?? '',
    r.bank_account_number ?? '', r.bank_account_holder ?? '',
    r.net_yen, r.fee_yen, r.amount_yen, r.due_date ?? '',
  ].map(esc).join(','))
  return '﻿' + [head.map(esc).join(','), ...lines].join('\r\n')
}

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  requested: '申請中',
  approved: '承認済み（振込待ち）',
  paid: '振込完了',
  rejected: '却下',
  cancelled: '取消',
}
