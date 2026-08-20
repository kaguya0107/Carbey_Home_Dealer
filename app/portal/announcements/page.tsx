import Link from 'next/link'
import { Bell, ChevronRight } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { listAnnouncements } from '@/lib/portal/announcements'
import { hasConsented } from '@/lib/portal/agreements'
import { markAllUserRead } from '@/lib/portal/notifications'
import { DarkCard } from '@/components/portal-dark/DarkUI'
import TermsConsentNotice from '@/components/portal-dark/TermsConsentNotice'

export const dynamic = 'force-dynamic'

export default async function MemberAnnouncementsPage() {
  const session = await requireMember()
  const [items, consent] = await Promise.all([
    listAnnouncements(true, 50),
    hasConsented(session.userId),
  ])
  // 開いたら通知を既読化
  await markAllUserRead(session.userId)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">お知らせ</h1>
        <p className="text-sm text-slate-400">本部からのお知らせ一覧です。各項目をタップすると詳細を開けます。</p>
      </div>

      {/* ⑬ 利用規約の同意が未了なら、お知らせから同意できるよう常設表示（スルー防止） */}
      {consent.agreement && !consent.consented && (
        <TermsConsentNotice version={consent.agreement.version} title={consent.agreement.title} />
      )}

      <DarkCard>
        <ul className="divide-y divide-carbon-700">
          {items.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-5 py-14 text-slate-500">
              <Bell className="h-8 w-8" />
              <span className="text-sm">お知らせはありません。</span>
            </li>
          )}
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`/portal/announcements/${a.id}`} className="flex items-start gap-3 px-5 py-4 transition hover:bg-carbon-800/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {a.level === 'important' && (
                      <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">重要</span>
                    )}
                    <span className="truncate font-medium text-white">{a.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString('ja-JP')}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm text-slate-400">{a.body}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
              </Link>
            </li>
          ))}
        </ul>
      </DarkCard>
    </div>
  )
}
