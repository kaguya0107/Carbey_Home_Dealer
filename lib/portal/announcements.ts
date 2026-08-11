import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { AnnouncementRow } from '@/types/database'

/** お知らせ一覧（新しい順）。published=true のみ返すオプション。 */
export async function listAnnouncements(publishedOnly = false, limit = 50): Promise<AnnouncementRow[]> {
  const supabase = createServiceRoleClient()
  let q = supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(limit)
  if (publishedOnly) q = q.eq('published', true)
  const { data, error } = await q
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

/** お知らせを削除する（本部）。 */
export async function deleteAnnouncement(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
