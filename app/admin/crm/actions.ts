'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import {
  createCustomer,
  updateCustomer,
  addPurchase,
  createDeal,
  updateDealStatus,
  addDealNote,
} from '@/lib/portal/crm'
import type { DealStatus } from '@/types/database'

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
function num(v: FormDataEntryValue | null): number | null {
  const s = str(v)
  return s == null ? null : Number(s)
}

export async function createCustomerAction(formData: FormData) {
  await requireFeature('crm')
  const name = str(formData.get('name'))
  if (!name) redirect('/admin/crm/new?error=name_required')
  const c = await createCustomer({
    name,
    phone: str(formData.get('phone')),
    email: str(formData.get('email')),
    address: str(formData.get('address')),
    note: str(formData.get('note')),
    member_id: str(formData.get('member_id')),
  })
  revalidatePath('/admin/crm')
  redirect(`/admin/crm/${c.id}`)
}

export async function updateCustomerAction(formData: FormData) {
  await requireFeature('crm')
  const id = str(formData.get('id'))
  if (!id) redirect('/admin/crm')
  await updateCustomer(id, {
    name: str(formData.get('name')) ?? undefined,
    phone: str(formData.get('phone')),
    email: str(formData.get('email')),
    address: str(formData.get('address')),
    note: str(formData.get('note')),
    member_id: str(formData.get('member_id')),
  })
  revalidatePath(`/admin/crm/${id}`)
  redirect(`/admin/crm/${id}`)
}

export async function addPurchaseAction(formData: FormData) {
  await requireFeature('crm')
  const id = str(formData.get('customer_id'))
  const vehicle = str(formData.get('vehicle_name'))
  if (!id || !vehicle) redirect(`/admin/crm/${id ?? ''}`)
  await addPurchase(id, vehicle, num(formData.get('price_yen')), str(formData.get('purchased_at')))
  revalidatePath(`/admin/crm/${id}`)
  redirect(`/admin/crm/${id}`)
}

export async function createDealAction(formData: FormData) {
  await requireFeature('crm')
  const customer_id = str(formData.get('customer_id'))
  if (!customer_id) redirect('/admin/crm')
  await createDeal({
    customer_id,
    title: str(formData.get('title')),
    status: (str(formData.get('status')) ?? 'lead') as DealStatus,
    amount_yen: num(formData.get('amount_yen')),
  })
  revalidatePath(`/admin/crm/${customer_id}`)
  redirect(`/admin/crm/${customer_id}`)
}

export async function updateDealStatusAction(formData: FormData) {
  await requireFeature('crm')
  const id = str(formData.get('deal_id'))
  const customer_id = str(formData.get('customer_id'))
  const status = str(formData.get('status'))
  if (!id || !status) redirect(`/admin/crm/${customer_id ?? ''}`)
  await updateDealStatus(id, status)
  revalidatePath(`/admin/crm/${customer_id}`)
  redirect(`/admin/crm/${customer_id}`)
}

export async function addDealNoteAction(formData: FormData) {
  const gate = await requireFeature('crm')
  const deal_id = str(formData.get('deal_id'))
  const customer_id = str(formData.get('customer_id'))
  const body = str(formData.get('body'))
  if (!deal_id || !body) redirect(`/admin/crm/${customer_id ?? ''}`)
  await addDealNote(deal_id, body, gate.userId)
  revalidatePath(`/admin/crm/${customer_id}`)
  redirect(`/admin/crm/${customer_id}`)
}
