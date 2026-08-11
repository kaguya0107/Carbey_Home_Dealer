import { createServiceRoleClient } from '@/lib/supabase/admin'
import { resolveFlow } from '@/lib/portal/flow'
import type { ManualSectionRow, FlowType } from '@/types/database'

export type ManualSectionWithCheck = ManualSectionRow & { checked: boolean; attachment_url: string | null }

/** 公開中の実践マニュアル項目（並び順）。flow を指定すると該当フロー（＋both）に限定。 */
export async function listPublishedSections(flow?: FlowType): Promise<ManualSectionRow[]> {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('manual_sections')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
  if (flow) query = query.in('flow', [flow, 'both'])
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ManualSectionRow[]
}

/** 全項目（本部CMS用・非公開含む）。 */
export async function listAllSections(): Promise<ManualSectionRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('manual_sections').select('*').order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ManualSectionRow[]
}

/** 加盟店向け：実効フローに該当する公開項目にチェック状況を付与。 */
export async function getMemberManual(userId: string): Promise<{ sections: ManualSectionWithCheck[]; total: number; done: number; flow: FlowType } | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id, active_flow, grant_semi, grant_auto')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; active_flow: FlowType | null; grant_semi: boolean; grant_auto: boolean }>()
  if (!member) return null

  // レビュー④：運用方式は会員ごとの権限で判定（プラン従属をやめた）
  const flow = resolveFlow({ grant_semi: member.grant_semi, grant_auto: member.grant_auto }, member.active_flow)
  const sections = await listPublishedSections(flow)
  const { data: prog } = await supabase.from('manual_progress').select('section_id').eq('member_id', member.id)
  const checkedIds = new Set((prog ?? []).map((p: { section_id: string }) => p.section_id))

  const withCheck = sections.map((s) => ({
    ...s,
    checked: checkedIds.has(s.id),
    attachment_url: s.attachment_path ? manualMediaUrl(s.attachment_path) : null,
  }))
  return { sections: withCheck, total: withCheck.length, done: withCheck.filter((s) => s.checked).length, flow }
}

/** 加盟店：項目をチェック/解除。 */
export async function toggleSectionCheck(userId: string, sectionId: string, checked: boolean): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!member) throw new Error('会員情報が紐付いていません')

  if (checked) {
    const { error } = await supabase
      .from('manual_progress')
      .upsert({ member_id: member.id, section_id: sectionId } as never, { onConflict: 'member_id,section_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('manual_progress').delete().eq('member_id', member.id).eq('section_id', sectionId)
    if (error) throw new Error(error.message)
  }
}

const MANUAL_BUCKET = 'manual-media'

/** 本部：マニュアル添付ファイルをアップロードし path を返す（㉜）。 */
export async function uploadManualAttachment(file: { buffer: Buffer; name: string; type: string }): Promise<string> {
  const supabase = createServiceRoleClient()
  const safeName = file.name.replace(/[^\w.\-]/g, '_')
  const path = `sections/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(MANUAL_BUCKET).upload(path, file.buffer, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

/** manual-media の公開URLを返す。 */
export function manualMediaUrl(path: string): string {
  const supabase = createServiceRoleClient()
  return supabase.storage.from(MANUAL_BUCKET).getPublicUrl(path).data.publicUrl
}

/** 本部：項目を保存（新規/更新）。flow・動画URL・添付を指定可（㉜）。 */
export async function saveSection(input: {
  id?: string
  title: string
  body: string | null
  note: string | null
  flow: 'semi' | 'auto' | 'both'
  published: boolean
  video_url?: string | null
  attachment_path?: string | null
  attachment_name?: string | null
}): Promise<void> {
  const supabase = createServiceRoleClient()
  // 添付は指定があれば上書き、undefined なら既存維持（update時）
  const media: Record<string, unknown> = { video_url: input.video_url ?? null }
  if (input.attachment_path !== undefined) {
    media.attachment_path = input.attachment_path
    media.attachment_name = input.attachment_name ?? null
  }
  if (input.id) {
    const { error } = await supabase
      .from('manual_sections')
      .update({ title: input.title, body: input.body, note: input.note, flow: input.flow, published: input.published, ...media } as never)
      .eq('id', input.id)
    if (error) throw new Error(error.message)
  } else {
    const { data: last } = await supabase.from('manual_sections').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle<{ sort_order: number }>()
    const sort = (last?.sort_order ?? 0) + 10
    const { error } = await supabase
      .from('manual_sections')
      .insert({ title: input.title, body: input.body, note: input.note, flow: input.flow, published: input.published, sort_order: sort, ...media } as never)
    if (error) throw new Error(error.message)
  }
}

/** 本部：項目を削除。 */
export async function deleteSection(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('manual_sections').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** 本部：並び替え（上下移動）。隣接項目と sort_order を入れ替える。 */
export async function moveSection(id: string, dir: 'up' | 'down'): Promise<void> {
  const supabase = createServiceRoleClient()
  const all = await listAllSections()
  const idx = all.findIndex((s) => s.id === id)
  if (idx < 0) return
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= all.length) return
  const a = all[idx]
  const b = all[swapIdx]
  await supabase.from('manual_sections').update({ sort_order: b.sort_order } as never).eq('id', a.id)
  await supabase.from('manual_sections').update({ sort_order: a.sort_order } as never).eq('id', b.id)
}
