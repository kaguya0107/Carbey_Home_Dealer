'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { saveSection, deleteSection, moveSection, uploadManualAttachment } from '@/lib/portal/manual'

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

const ATTACH_MAX = 20 * 1024 * 1024 // 20MB

/** マニュアル項目を保存（新規/更新）。動画URL・添付ファイル対応（㉜）。 */
export async function saveSectionAction(formData: FormData) {
  await requireStaff()
  const id = str(formData.get('id')) || undefined
  const title = str(formData.get('title'))
  const body = str(formData.get('body')) || null
  const note = str(formData.get('note')) || null
  const flowRaw = str(formData.get('flow'))
  const flow = (flowRaw === 'auto' || flowRaw === 'both' ? flowRaw : 'semi') as 'semi' | 'auto' | 'both'
  const video_url = str(formData.get('video_url')) || null
  const published = formData.get('published') === 'on'
  if (!title) redirect('/admin/manual?error=required')

  // 添付ファイル（任意）。指定があればアップロードして path を保存。
  let attachment_path: string | null | undefined = undefined
  let attachment_name: string | null | undefined = undefined
  const file = formData.get('attachment')
  if (file instanceof File && file.size > 0) {
    if (file.size > ATTACH_MAX) redirect('/admin/manual?error=attach_too_large')
    const buffer = Buffer.from(await file.arrayBuffer())
    attachment_path = await uploadManualAttachment({ buffer, name: file.name, type: file.type || 'application/octet-stream' })
    attachment_name = file.name
  }

  await saveSection({ id, title, body, note, flow, published, video_url, attachment_path, attachment_name })
  revalidatePath('/admin/manual')
  revalidatePath('/portal/onboarding/manual')
  revalidatePath('/portal/training')
  redirect('/admin/manual?saved=1')
}

/** マニュアル項目を削除。 */
export async function deleteSectionAction(formData: FormData) {
  await requireStaff()
  const id = str(formData.get('id'))
  if (!id) redirect('/admin/manual')
  await deleteSection(id)
  revalidatePath('/admin/manual')
  redirect('/admin/manual')
}

/** マニュアル項目の並び替え。 */
export async function moveSectionAction(formData: FormData) {
  await requireStaff()
  const id = str(formData.get('id'))
  const dir = str(formData.get('dir')) === 'up' ? 'up' : 'down'
  if (!id) redirect('/admin/manual')
  await moveSection(id, dir)
  revalidatePath('/admin/manual')
  revalidatePath('/portal/onboarding/manual')
  redirect('/admin/manual')
}
