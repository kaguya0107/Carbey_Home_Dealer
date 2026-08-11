import { Bell } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { listAnnouncements } from '@/lib/portal/announcements'
import { markAllUserRead } from '@/lib/portal/notifications'
import { DarkCard } from '@/components/portal-dark/DarkUI'

export const dynamic = 'force-dynamic'

export default async function MemberAnnouncementsPage() {
  const session = await requireMember()
  const items = await listAnnouncements(true, 50)
  // 開いたら通知を既読化
  await markAllUserRead(session.userId)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">お知らせ</h1>
        <p className="text-sm text-slate-400">本部からのお知らせ一覧です。</p>
      </div>

      <DarkCard>
        <ul className="divide-y divide-carbon-700">
          {items.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-5 py-14 text-slate-500">
              <Bell className="h-8 w-8" />
              <span className="text-sm">お知らせはありません。</span>
            </li>
          )}
          {items.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <div className="flex items-center gap-2">
                {a.level === 'important' && (
                  <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">重要</span>
                )}
                <span className="font-medium text-white">{a.title}</span>
                <span className="ml-auto text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString('ja-JP')}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-300">{a.body}</p>
            </li>
          ))}
        </ul>
      </DarkCard>
    </div>
  )
}
