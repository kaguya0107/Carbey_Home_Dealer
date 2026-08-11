'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import { chooseMethod, setSelfAmount, completeMemberStep } from '@/lib/portal/funding'
import type { FundingMethod } from '@/types/database'

/** 資金の方法を選択（自己資金/資金調達）。 */
export async function chooseMethodAction(method: FundingMethod): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  try {
    await chooseMethod(session.userId, method)
    revalidatePath('/portal/onboarding/funding')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '選択に失敗しました' }
  }
}

/** 自己資金額を登録。 */
export async function setSelfAmountAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  const amount = Number(String(formData.get('amount') ?? '').replace(/[^\d]/g, ''))
  if (!amount || amount <= 0) return { ok: false, error: '金額を入力してください' }
  try {
    await setSelfAmount(session.userId, amount)
    revalidatePath('/portal/onboarding/funding')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '登録に失敗しました' }
  }
}

/** 加盟店担当の資金調達ステップを完了する。 */
export async function completeStepAction(stepKey: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMember()
  try {
    await completeMemberStep(session.userId, stepKey)
    revalidatePath('/portal/onboarding/funding')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '完了に失敗しました' }
  }
}
