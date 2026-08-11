'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import { switchOwnFlow } from '@/lib/portal/flow'
import type { FlowType } from '@/types/database'

/** 加盟店が実行フロー（semi/auto）を切り替える。両モデル保有のみ。 */
export async function switchFlowAction(flow: FlowType): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  try {
    await switchOwnFlow(session.userId, flow)
    revalidatePath('/portal/onboarding')
    revalidatePath('/portal/onboarding/manual')
    revalidatePath('/portal/dashboard')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '切り替えに失敗しました' }
  }
}
