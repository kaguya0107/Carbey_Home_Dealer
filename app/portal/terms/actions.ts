'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import { consentToActive } from '@/lib/portal/agreements'

/** 加盟店が現在有効な利用規約に同意する。 */
export async function consentAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  try {
    await consentToActive(session.userId)
    revalidatePath('/portal/terms')
    revalidatePath('/portal/onboarding')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '同意の記録に失敗しました' }
  }
}
