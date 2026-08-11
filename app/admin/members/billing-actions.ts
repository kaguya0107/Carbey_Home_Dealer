'use server'

import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { createInvoice, createSlotPurchaseInvoice, recordPayment, markBilled, cancelInvoice, deleteInvoice } from '@/lib/portal/billing'
import { runMonthlyMgmtFee, setMgmtFeeAuto } from '@/lib/portal/mgmt-fee'
import { setMemberSlotCapital } from '@/lib/portal/auto-trading'
import { redirect } from 'next/navigation'
import type { InvoiceKind } from '@/types/database'

const KINDS: InvoiceKind[] = ['joining', 'system_fee', 'monthly', 'royalty', 'management_fee', 'slot_fee', 'sourcing_fund', 'other']

function num(v: FormDataEntryValue | null): number {
  return Number(String(v ?? '').replace(/[^\d]/g, ''))
}

/** ㊵ 自動売買 枠の資金設定（最低値・最高値）を加盟者ごとに保存（本部）。 */
export async function setSlotCapitalAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  if (!memberId) return
  const maxCapital = num(formData.get('max_capital')) // 最高値＝1枠あたり運用資金
  const minRaw = String(formData.get('min_deposit') ?? '').replace(/[^\d]/g, '')
  const minDeposit = minRaw === '' ? null : Number(minRaw) // 空欄＝全体設定を使う
  try {
    await setMemberSlotCapital(memberId, { minDepositYen: minDeposit, maxCapitalYen: maxCapital })
  } catch (e) {
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
    const msg = e instanceof Error ? e.message : '枠の資金設定に失敗しました'
    redirect(`/admin/members/${memberId}?error=${encodeURIComponent(msg)}`)
  }
  revalidatePath(`/admin/members/${memberId}`)
  redirect(`/admin/members/${memberId}?saved=slotcapital`)
}

/** #33 月額管理手数料の「自動引き落とし」ON/OFF を切り替える（本部）。 */
export async function setMgmtFeeAutoAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  const on = String(formData.get('on') ?? '') === '1'
  if (memberId) await setMgmtFeeAuto(memberId, on)
  revalidatePath(`/admin/members/${memberId}`)
}

/** 本部が当該加盟者の月額管理手数料（枠数連動・満了月分）を月次で相殺／請求する。 */
export async function runMemberMgmtFeeAction(formData: FormData) {
  const session = await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  if (!memberId) return
  try {
    const r = await runMonthlyMgmtFee(memberId, session.userId)
    revalidatePath(`/admin/members/${memberId}`)
    const msg = r.charged
      ? `月額管理手数料を実行：${r.months}か月・総額${r.gross.toLocaleString()}円（預かり金相殺${r.fromDeposit.toLocaleString()}円／不足請求${r.shortfall.toLocaleString()}円）`
      : `課金はありませんでした（${r.skippedReason ?? '対象なし'}）`
    redirect(`/admin/members/${memberId}?msg=${encodeURIComponent(msg)}`)
  } catch (e) {
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
    redirect(`/admin/members/${memberId}?error=${encodeURIComponent(e instanceof Error ? e.message : '実行に失敗しました')}`)
  }
}

/** 本部が自動売買の枠購入を請求する（1枠=10万円）。消込完了で枠が自動加算される。 */
export async function createSlotPurchaseAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  const slotCount = num(formData.get('slot_count'))
  if (!memberId || !slotCount) return
  try {
    await createSlotPurchaseInvoice({ memberId, slotCount })
  } catch (e) {
    if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
    const msg = e instanceof Error ? e.message : '枠購入の請求に失敗しました'
    redirect(`/admin/members/${memberId}?error=${encodeURIComponent(msg)}`)
  }
  revalidatePath(`/admin/members/${memberId}`)
  redirect(`/admin/members/${memberId}`)
}

/** 本部が請求を作成する（請求予定 or 即請求）。 */
export async function createInvoiceAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  const kind = String(formData.get('kind') ?? '') as InvoiceKind
  const amount = num(formData.get('amount'))
  const title = String(formData.get('title') ?? '').trim() || null
  const dueDate = String(formData.get('due_date') ?? '').trim() || null
  const note = String(formData.get('note') ?? '').trim() || null
  const requested = formData.get('requested') === 'on'
  if (!memberId || !KINDS.includes(kind) || !amount || amount <= 0) return

  await createInvoice({ memberId, kind, title, amountYen: amount, dueDate, note, requested })
  revalidatePath(`/admin/members/${memberId}`)
}

/** 本部が請求を「請求済」にする。 */
export async function markBilledAction(formData: FormData) {
  await requireFeature('members')
  const id = String(formData.get('id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  if (!id) return
  await markBilled(id)
  revalidatePath(`/admin/members/${memberId}`)
}

/** 消込：入金を記録して請求に紐付ける。 */
export async function recordPaymentAction(formData: FormData) {
  await requireFeature('members')
  const invoiceId = String(formData.get('invoice_id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  const amount = num(formData.get('amount'))
  const paymentDate = String(formData.get('payment_date') ?? '').trim() || null
  const note = String(formData.get('note') ?? '').trim() || null
  if (!invoiceId || !memberId || !amount || amount <= 0) return

  await recordPayment({ invoiceId, memberId, amountYen: amount, paymentDate, note })
  revalidatePath(`/admin/members/${memberId}`)
}

/** 請求を取消。 */
export async function cancelInvoiceAction(formData: FormData) {
  await requireFeature('members')
  const id = String(formData.get('id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  if (!id) return
  await cancelInvoice(id)
  revalidatePath(`/admin/members/${memberId}`)
}

/** 請求を削除。 */
export async function deleteInvoiceAction(formData: FormData) {
  await requireFeature('members')
  const id = String(formData.get('id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  if (!id) return
  await deleteInvoice(id)
  revalidatePath(`/admin/members/${memberId}`)
}
