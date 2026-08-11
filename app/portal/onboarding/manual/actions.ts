'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import { toggleSectionCheck } from '@/lib/portal/manual'

/** 加盟店がマニュアル項目をチェック/解除する。 */
export async function toggleManualAction(sectionId: string, checked: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  try {
    await toggleSectionCheck(session.userId, sectionId, checked)
    revalidatePath('/portal/onboarding/manual')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '更新に失敗しました' }
  }
}
