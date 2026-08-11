'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { updateOrderStatus, approveOrder, rejectOrder } from '@/lib/portal/orders'
import type { OrderStatus } from '@/types/database'

const STATUSES: OrderStatus[] = ['received', 'in_progress', 'completed', 'cancelled']

/** オーダーのステータスを変更する（本部）。 */
export async function setOrderStatusAction(formData: FormData) {
  await requireFeature('orders')
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '') as OrderStatus
  if (!id || !STATUSES.includes(status)) redirect('/admin/orders')

  await updateOrderStatus(id, status)
  revalidatePath('/admin/orders')
  redirect('/admin/orders')
}

/** #24 仕入れオーダーを承認する（本部）。 */
export async function approveOrderAction(formData: FormData) {
  const session = await requireFeature('orders')
  const id = String(formData.get('id') ?? '')
  if (id) await approveOrder(id, session.userId)
  revalidatePath('/admin/orders')
  redirect('/admin/orders')
}

/** #24 仕入れオーダーを非承認にする（本部・理由つき）。 */
export async function rejectOrderAction(formData: FormData) {
  const session = await requireFeature('orders')
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (id) await rejectOrder(id, session.userId, reason)
  revalidatePath('/admin/orders')
  redirect('/admin/orders')
}
