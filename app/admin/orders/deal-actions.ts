'use server'

import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { moveToPrepping } from '@/lib/portal/deals'

/**
 * 本部：案件を「商品化中」へ手動移行する（整備・修理が発生した場合のみ）。
 * 「納品完了」は要件どおり加盟店の受け取り完了ボタンで行うため、本部側には置かない。
 */
export async function adminMoveToPreppingAction(formData: FormData) {
  const session = await requireFeature('orders')
  const dealId = String(formData.get('deal_id') ?? '')
  if (!dealId) return
  await moveToPrepping(dealId, session.userId, true)
  revalidatePath('/admin/orders')
}
