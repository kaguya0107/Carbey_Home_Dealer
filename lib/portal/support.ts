import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { SupportItemRow } from '@/types/database'

/**
 * 本部サポート項目（フェーズ⑦-2 CMS）。
 * 実践マニュアル CMS と同じ方式（title/body/note/sort_order/published）。
 * 「代行」ではなく「紹介・取次」名目の案内を保持する。
 */

/** 公開中のサポート項目（並び順）。加盟店への案内にも使える。 */
export async function listPublishedSupportItems(): Promise<SupportItemRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('support_items')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SupportItemRow[]
}

/** 全項目（本部CMS用・非公開含む）。 */
export async function listAllSupportItems(): Promise<SupportItemRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('support_items').select('*').order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SupportItemRow[]
}

/** 本部：項目を保存（新規/更新）。 */
export async function saveSupportItem(input: {
  id?: string
  title: string
  body: string | null
  note: string | null
  published: boolean
}): Promise<void> {
  const supabase = createServiceRoleClient()
  if (input.id) {
    const { error } = await supabase
      .from('support_items')
      .update({ title: input.title, body: input.body, note: input.note, published: input.published } as never)
      .eq('id', input.id)
    if (error) throw new Error(error.message)
  } else {
    const { data: last } = await supabase.from('support_items').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle<{ sort_order: number }>()
    const sort = (last?.sort_order ?? 0) + 10
    const { error } = await supabase
      .from('support_items')
      .insert({ title: input.title, body: input.body, note: input.note, published: input.published, sort_order: sort } as never)
    if (error) throw new Error(error.message)
  }
}

/** 本部：項目を削除。 */
export async function deleteSupportItem(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('support_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** 本部：並び替え（上下移動）。隣接項目と sort_order を入れ替える。 */
export async function moveSupportItem(id: string, dir: 'up' | 'down'): Promise<void> {
  const supabase = createServiceRoleClient()
  const all = await listAllSupportItems()
  const idx = all.findIndex((s) => s.id === id)
  if (idx < 0) return
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= all.length) return
  const a = all[idx]
  const b = all[swapIdx]
  await supabase.from('support_items').update({ sort_order: b.sort_order } as never).eq('id', a.id)
  await supabase.from('support_items').update({ sort_order: a.sort_order } as never).eq('id', b.id)
}
