'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { saveSupportItem, deleteSupportItem, moveSupportItem } from '@/lib/portal/support'

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** サポート項目を保存（新規/更新）。 */
export async function saveSupportItemAction(formData: FormData) {
  await requireStaff()
  const id = str(formData.get('id')) || undefined
  const title = str(formData.get('title'))
  const body = str(formData.get('body')) || null
  const note = str(formData.get('note')) || null
  const published = formData.get('published') === 'on'
  if (!title) redirect('/admin/support?error=required')

  await saveSupportItem({ id, title, body, note, published })
  revalidatePath('/admin/support')
  redirect('/admin/support?saved=1')
}

/** サポート項目を削除。 */
export async function deleteSupportItemAction(formData: FormData) {
  await requireStaff()
  const id = str(formData.get('id'))
  if (!id) redirect('/admin/support')
  await deleteSupportItem(id)
  revalidatePath('/admin/support')
  redirect('/admin/support')
}

/** サポート項目の並び替え。 */
export async function moveSupportItemAction(formData: FormData) {
  await requireStaff()
  const id = str(formData.get('id'))
  const dir = str(formData.get('dir')) === 'up' ? 'up' : 'down'
  if (!id) redirect('/admin/support')
  await moveSupportItem(id, dir)
  revalidatePath('/admin/support')
  redirect('/admin/support')
}
