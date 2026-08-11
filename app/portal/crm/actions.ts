'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import {
  createOwnCustomer, updateOwnCustomer, addOwnPurchase, createOwnDeal, updateOwnDealStatus,
} from '@/lib/portal/crm-member'
import type { DealStatus } from '@/types/database'

const str = (v: FormDataEntryValue | null): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
const num = (v: FormDataEntryValue | null): number | null => {
  const s = str(v)
  return s == null ? null : Number(s)
}

export async function createCustomerAction(formData: FormData) {
  const session = await requireMember()
  const name = str(formData.get('name'))
  if (!name) redirect('/portal/crm?error=name')
  await createOwnCustomer(session.userId, {
    name,
    phone: str(formData.get('phone')),
    email: str(formData.get('email')),
    address: str(formData.get('address')),
    note: str(formData.get('note')),
  })
  revalidatePath('/portal/crm')
  redirect('/portal/crm')
}

export async function updateCustomerAction(formData: FormData) {
  const session = await requireMember()
  const id = str(formData.get('id'))
  if (!id) redirect('/portal/crm')
  const name = str(formData.get('name'))
  if (!name) redirect(`/portal/crm/${id}?error=name`)
  await updateOwnCustomer(session.userId, id, {
    name,
    phone: str(formData.get('phone')),
    email: str(formData.get('email')),
    address: str(formData.get('address')),
    note: str(formData.get('note')),
  })
  revalidatePath(`/portal/crm/${id}`)
  redirect(`/portal/crm/${id}`)
}

export async function addPurchaseAction(formData: FormData) {
  const session = await requireMember()
  const id = str(formData.get('customer_id'))
  if (!id) redirect('/portal/crm')
  await addOwnPurchase(session.userId, id, str(formData.get('vehicle_name')), num(formData.get('price_yen')), str(formData.get('purchased_at')))
  revalidatePath(`/portal/crm/${id}`)
  redirect(`/portal/crm/${id}`)
}

export async function createDealAction(formData: FormData) {
  const session = await requireMember()
  const id = str(formData.get('customer_id'))
  if (!id) redirect('/portal/crm')
  await createOwnDeal(session.userId, id, str(formData.get('title')), num(formData.get('amount_yen')))
  revalidatePath(`/portal/crm/${id}`)
  redirect(`/portal/crm/${id}`)
}

export async function updateDealStatusAction(formData: FormData) {
  const session = await requireMember()
  const dealId = str(formData.get('deal_id'))
  const customerId = str(formData.get('customer_id'))
  const status = str(formData.get('status')) as DealStatus | null
  if (!dealId || !status) redirect('/portal/crm')
  await updateOwnDealStatus(session.userId, dealId, status)
  if (customerId) revalidatePath(`/portal/crm/${customerId}`)
  redirect(customerId ? `/portal/crm/${customerId}` : '/portal/crm')
}
