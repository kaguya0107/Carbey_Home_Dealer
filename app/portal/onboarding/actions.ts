'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import { completeOwnTask } from '@/lib/portal/onboarding'

/** 加盟店が自分の auto タスクを完了する（ゲート厳守）。 */
export async function completeTaskAction(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  try {
    await completeOwnTask(session.userId, taskId)
    revalidatePath('/portal/onboarding')
    revalidatePath('/portal/dashboard')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '完了できませんでした' }
  }
}
