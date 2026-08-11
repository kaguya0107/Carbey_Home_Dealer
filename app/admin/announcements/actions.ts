'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { createAnnouncement, deleteAnnouncement } from '@/lib/portal/announcements'

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

/** お知らせを投稿する（本部）。全 active 加盟店へ通知が飛ぶ。 */
export async function createAnnouncementAction(formData: FormData) {
  const session = await requireStaff()
  const title = str(formData.get('title'))
  const body = str(formData.get('body'))
  const level = str(formData.get('level')) === 'important' ? 'important' : 'info'
  if (!title || !body) redirect('/admin/announcements?error=required')

  await createAnnouncement({ title: title!, body: body!, level, authorId: session.userId })
  revalidatePath('/admin/announcements')
  redirect('/admin/announcements?created=1')
}

/** お知らせを削除する（本部）。 */
export async function deleteAnnouncementAction(formData: FormData) {
  await requireStaff()
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/announcements')
  await deleteAnnouncement(id)
  revalidatePath('/admin/announcements')
  redirect('/admin/announcements')
}
