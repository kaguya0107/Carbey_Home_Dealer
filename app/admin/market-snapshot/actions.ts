'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { requeueTemplate } from '@/lib/portal/snapshot-config'

/**
 * ⑦ 失敗スナップショットの手動再実行。
 * 該当テンプレの3日クールダウンを解除し、次の取得時刻の巡回で再収集させる。
 */
export async function requeueSnapshotAction(formData: FormData) {
  await requireStaff()
  const templateId = String(formData.get('templateId') ?? '')
  if (!templateId) redirect('/admin/market-snapshot')

  let result: { scheduledTimeJst: string | null; enabled: boolean } | null = null
  let failed = false
  try {
    result = await requeueTemplate(templateId)
  } catch {
    failed = true
  }
  revalidatePath('/admin/market-snapshot')

  // redirect は try の外（NEXT_REDIRECT を握りつぶさない）
  if (failed) redirect('/admin/market-snapshot?requeue=error')
  if (result && !result.enabled) redirect('/admin/market-snapshot?requeue=disabled')
  redirect(`/admin/market-snapshot?requeue=ok&at=${encodeURIComponent(result?.scheduledTimeJst ?? '')}`)
}
