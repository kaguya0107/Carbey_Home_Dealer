import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/admin'

/**
 * system_settings をリクエスト内で1回だけ取得（React cache でメモ化）。
 * 1画面で税率・単価・キャパ・出金設定などを個別に問い合わせていた往復をまとめ、高速化する（性能最適化A）。
 * 値の意味・既定値は各利用側（auto-trading / mgmt-fee / withdrawal）が持つ。
 */
export const getSettingsMap = cache(async (): Promise<Map<string, number | null>> => {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('system_settings').select('key, value_int')
  const map = new Map<string, number | null>()
  for (const r of (data ?? []) as { key: string; value_int: number | null }[]) map.set(r.key, r.value_int)
  return map
})

/** 単一キーの取得（未設定は fallback）。 */
export async function getSetting(key: string, fallback: number): Promise<number> {
  const map = await getSettingsMap()
  return map.get(key) ?? fallback
}
