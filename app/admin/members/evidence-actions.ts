'use server'

import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { reviewEvidence } from '@/lib/portal/evidence'
import { syncOnboardingStatus } from '@/lib/portal/onboarding'

/**
 * 本部がエビデンスを承認/却下する。
 * 承認するとオンボーディングの「本人確認」タスクが完了になるため、その場で同期し、
 * 本部の各画面（承認待ちキュー・進捗）へ即時反映する（レビュー⑪-②）。
 */
export async function reviewEvidenceAction(formData: FormData) {
  const session = await requireFeature('members')
  const evidenceId = String(formData.get('evidence_id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  const status = String(formData.get('status') ?? '')
  const note = String(formData.get('note') ?? '').trim() || null
  if (!evidenceId || (status !== 'approved' && status !== 'rejected')) return

  await reviewEvidence(evidenceId, session.userId, status, note)
  if (memberId) await syncOnboardingStatus(memberId)

  revalidatePath(`/admin/members/${memberId}`)
  revalidatePath(`/admin/onboarding/${memberId}`)
  revalidatePath('/admin/onboarding')
  revalidatePath('/admin/dashboard')
}
