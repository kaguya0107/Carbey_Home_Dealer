import { Megaphone, CheckCircle2, Archive, ArchiveRestore, AlertTriangle } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { listAnnouncements, listArchivedAnnouncements } from '@/lib/portal/announcements'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { createAnnouncementAction, archiveAnnouncementAction, unarchiveAnnouncementAction } from './actions'

export const dynamic = 'force-dynamic'

const field =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'
const labelCls = 'mb-1 block text-[13px] font-medium text-slate-700'

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>
}) {
  await requireStaff()
  const items = await listAnnouncements()
  const archived = await listArchivedAnnouncements()
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">お知らせ配信</h1>
        <p className="text-sm text-slate-500">全加盟店に一斉にお知らせを配信します。投稿すると各加盟店に通知が届きます。</p>
      </div>

      {sp.created && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> お知らせを配信しました。
        </div>
      )}
      {sp.error === 'required' && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">タイトルと本文は必須です。</div>
      )}

      {/* 投稿フォーム */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-brand-500" /> 新規お知らせ</span>} />
        <CardBody>
          <form action={createAnnouncementAction} className="space-y-4">
            <div>
              <label className={labelCls}>タイトル *</label>
              <input name="title" required placeholder="システムメンテナンスのお知らせ" className={field} />
            </div>
            <div>
              <label className={labelCls}>本文 *</label>
              <textarea name="body" required rows={4} placeholder="内容を入力してください。" className={field} />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="level" value="important" className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
                重要なお知らせとして配信（加盟店側で強調表示）
              </label>
              <button className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600">
                配信する
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* 配信済み一覧 */}
      <Card>
        <CardHeader title="配信済みお知らせ" action={<span className="text-xs text-slate-400">{items.length} 件</span>} />
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100">
            {items.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-slate-400">まだお知らせがありません。</li>
            )}
            {items.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {a.level === 'important' && <Badge tone="red">重要</Badge>}
                    <span className="font-medium text-slate-900">{a.title}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                  <div className="mt-1 text-xs text-slate-400">{new Date(a.created_at).toLocaleString('ja-JP')}</div>
                </div>
                <form action={archiveAnnouncementAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="アーカイブ（内容は保全されます）" aria-label="アーカイブ">
                    <Archive className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* ⑤ アーカイブ済み（内容保全）— 物理削除せず保全し、折りたたみで可視化 */}
      {archived.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <details>
              <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 marker:text-slate-400">
                <Archive className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">アーカイブ済みお知らせ（内容保全）</span>
                <span className="text-xs text-slate-400">{archived.length} 件</span>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {archived.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {a.level === 'important' && <Badge tone="red">重要</Badge>}
                        <span className="font-medium text-slate-700">{a.title}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{a.body}</p>
                      <div className="mt-1 text-xs text-slate-400">
                        配信 {new Date(a.created_at).toLocaleString('ja-JP')}
                        {a.archived_at && <> ／ アーカイブ {new Date(a.archived_at).toLocaleString('ja-JP')}</>}
                      </div>
                    </div>
                    <form action={unarchiveAnnouncementAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="rounded-md p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="有効に戻す" aria-label="有効に戻す">
                        <ArchiveRestore className="h-4 w-4" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          </CardBody>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        お知らせは物理削除されず、アーカイブとして内容が保全されます（既に届いた通知は取り消されません）。
      </p>
    </div>
  )
}
