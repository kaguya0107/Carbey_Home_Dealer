import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { CrmCustomerRow, CrmCustomerInsert, CrmPurchaseRow, CrmDealRow, DealStatus } from '@/types/database'

/**
 * 加盟店（本人）向けCRMデータアクセス（#19）。
 * すべて自分の member_id に紐づく顧客・購入・商談だけを対象にする（他加盟店のデータには触れない）。
 * 呼び出し側で requireMember 済みであること。service-role を使うため、ここで所有権を明示的に検証する。
 */

const sb = () => createServiceRoleClient()

async function memberIdOf(userId: string): Promise<string | null> {
  const { data } = await sb()
    .from('members').select('id').eq('user_id', userId).is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

/** 自分の顧客が確かに自分のものか確認して返す（他人のものなら null）。 */
async function ownCustomer(userId: string, customerId: string): Promise<CrmCustomerRow | null> {
  const memberId = await memberIdOf(userId)
  if (!memberId) return null
  const { data } = await sb()
    .from('crm_customers').select('*').eq('id', customerId).eq('member_id', memberId)
    .maybeSingle<CrmCustomerRow>()
  return data ?? null
}
export const getOwnCustomer = ownCustomer

/** 自分の顧客一覧（名前・電話・メールで部分一致検索）。 */
export async function listOwnCustomers(userId: string, q?: string): Promise<CrmCustomerRow[]> {
  const memberId = await memberIdOf(userId)
  if (!memberId) return []
  let query = sb().from('crm_customers').select('*').eq('member_id', memberId).order('created_at', { ascending: false })
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
  const { data } = await query
  return (data ?? []) as unknown as CrmCustomerRow[]
}

export async function createOwnCustomer(userId: string, input: Omit<CrmCustomerInsert, 'member_id'>): Promise<void> {
  const memberId = await memberIdOf(userId)
  if (!memberId) throw new Error('会員情報が見つかりません')
  const { error } = await sb().from('crm_customers').insert({ ...input, member_id: memberId } as never)
  if (error) throw new Error(error.message)
}

export async function updateOwnCustomer(userId: string, customerId: string, patch: Omit<CrmCustomerInsert, 'member_id'>): Promise<void> {
  if (!(await ownCustomer(userId, customerId))) throw new Error('顧客が見つかりません')
  const { error } = await sb().from('crm_customers').update(patch as never).eq('id', customerId)
  if (error) throw new Error(error.message)
}

// --- 購入履歴 ---
export async function listOwnPurchases(userId: string, customerId: string): Promise<CrmPurchaseRow[]> {
  if (!(await ownCustomer(userId, customerId))) return []
  const { data } = await sb().from('crm_purchases').select('*').eq('customer_id', customerId).order('purchased_at', { ascending: false })
  return (data ?? []) as unknown as CrmPurchaseRow[]
}

export async function addOwnPurchase(userId: string, customerId: string, vehicle: string | null, price: number | null, purchasedAt: string | null): Promise<void> {
  if (!(await ownCustomer(userId, customerId))) throw new Error('顧客が見つかりません')
  const { error } = await sb().from('crm_purchases').insert({ customer_id: customerId, vehicle_name: vehicle, price_yen: price, purchased_at: purchasedAt } as never)
  if (error) throw new Error(error.message)
}

// --- 商談 ---
export async function listOwnDeals(userId: string, customerId: string): Promise<CrmDealRow[]> {
  if (!(await ownCustomer(userId, customerId))) return []
  const { data } = await sb().from('crm_deals').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
  return (data ?? []) as unknown as CrmDealRow[]
}

export async function createOwnDeal(userId: string, customerId: string, title: string | null, amount: number | null): Promise<void> {
  if (!(await ownCustomer(userId, customerId))) throw new Error('顧客が見つかりません')
  const { error } = await sb().from('crm_deals').insert({ customer_id: customerId, title, amount_yen: amount, status: 'lead' } as never)
  if (error) throw new Error(error.message)
}

export async function updateOwnDealStatus(userId: string, dealId: string, status: DealStatus): Promise<void> {
  const memberId = await memberIdOf(userId)
  if (!memberId) throw new Error('会員情報が見つかりません')
  const { data: deal } = await sb().from('crm_deals').select('customer_id').eq('id', dealId).maybeSingle<{ customer_id: string }>()
  if (!deal) throw new Error('商談が見つかりません')
  const { data: cust } = await sb().from('crm_customers').select('member_id').eq('id', deal.customer_id).maybeSingle<{ member_id: string | null }>()
  if (!cust || cust.member_id !== memberId) throw new Error('権限がありません')
  const { error } = await sb().from('crm_deals').update({ status } as never).eq('id', dealId)
  if (error) throw new Error(error.message)
}
