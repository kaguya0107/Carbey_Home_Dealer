'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { upsertNote } from '@/lib/portal/editable-notes'

export async function saveNoteAction(
  key: string,
  title: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaff()
  try {
    await upsertNote(key, { title, body }, session.userId)
    revalidatePath('/admin/notes')
    // 掲示先（加盟店AIページ）も即時反映
    revalidatePath('/portal/ai')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '保存に失敗しました。' }
  }
}
