'use server'

import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { confirmSelf, setAdminStep, setFundingMethodByAdmin } from '@/lib/portal/funding'

/** ㊹ 本部が資金準備の方法（分岐 自己資金/資金調達）を選択する。 */
export async function setFundingMethodAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  const method = String(formData.get('method') ?? '')
  if (!memberId || (method !== 'self' && method !== 'loan')) return
  await setFundingMethodByAdmin(memberId, method)
  revalidatePath(`/admin/members/${memberId}`)
}

/** 本部が自己資金を確認/確認取消する。 */
export async function confirmSelfAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  const confirmed = String(formData.get('confirmed') ?? '') === '1'
  if (!memberId) return

  await confirmSelf(memberId, confirmed)
  revalidatePath(`/admin/members/${memberId}`)
}

/** 本部が資金調達（loan）の本部側ステップを完了/取消する。 */
export async function setAdminStepAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  const stepKey = String(formData.get('step_key') ?? '')
  const done = String(formData.get('done') ?? '') === '1'
  if (!memberId || !stepKey) return

  await setAdminStep(memberId, stepKey, done)
  revalidatePath(`/admin/members/${memberId}`)
}
