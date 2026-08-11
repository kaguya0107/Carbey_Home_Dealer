'use server'

import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { cancelDeal } from '@/lib/portal/deals'

/** #34 販売実績（売却済み案件）を削除して取り消す（案件削除＋台帳の精算・ロイヤリティを戻す）。監査ログに記録。 */
export async function deleteSoldDealAction(formData: FormData) {
  const session = await requireFeature('reports')
  const dealId = String(formData.get('deal_id') ?? '')
  if (dealId) await cancelDeal(dealId, session.userId, session.name)
  revalidatePath('/admin/sales')
}
