import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { AnnouncementRow } from '@/types/database'

/** 有効なお知らせ一覧（新しい順・アーカイブ済みを除く）。published=true のみ返すオプション。 */
export async function listAnnouncements(publishedOnly = false, limit = 50): Promise<AnnouncementRow[]> {
  const supabase = createServiceRoleClient()
  let q = supabase.from('announcements').select('*').is('archived_at', null).order('created_at', { ascending: false }).limit(limit)
  if (publishedOnly) q = q.eq('published', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AnnouncementRow[]
}

/** お知らせ1件を取得（詳細表示用）。archived を含めるかは includeArchived で切替。 */
export async function getAnnouncement(id: string, publishedOnly = true): Promise<AnnouncementRow | null> {
  const supabase = createServiceRoleClient()
  let q = supabase.from('announcements').select('*').eq('id', id)
  if (publishedOnly) q = q.eq('published', true)
  const { data, error } = await q.maybeSingle<AnnouncementRow>()
  if (error) throw new Error(error.message)
  return data ?? null
}

/** アーカイブ済みお知らせ一覧（内容保全・新しい順）。 */
export async function listArchivedAnnouncements(limit = 100): Promise<AnnouncementRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AnnouncementRow[]
}

/** お知らせを作成する（本部）。fan-out 通知はトリガーが行う。 */
export async function createAnnouncement(input: {
  title: string
  body: string
  level: 'info' | 'important'
  authorId: string
}): Promise<AnnouncementRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: input.title,
      body: input.body,
      level: input.level,
      author_id: input.authorId,
      published: true,
    } as never)
    .select('*')
    .single<AnnouncementRow>()
  if (error) throw new Error(error.message)
  return data
}

/** お知らせをアーカイブする（本部）。内容保全のため物理削除せず archived_at を立てる。 */
export async function archiveAnnouncement(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('announcements')
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** アーカイブを解除して有効へ戻す（本部）。 */
export async function unarchiveAnnouncement(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('announcements')
    .update({ archived_at: null } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
}
