import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { getAnnouncement } from '@/lib/portal/announcements'
import { DarkCard, DarkCardBody } from '@/components/portal-dark/DarkUI'

export const dynamic = 'force-dynamic'

export default async function MemberAnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember()
  const { id } = await params
  const a = await getAnnouncement(id)
  if (!a) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal/announcements" className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> お知らせ一覧へ戻る
      </Link>

      <DarkCard>
        <DarkCardBody className="space-y-3">
          <div className="flex items-center gap-2">
            {a.level === 'important' && (
              <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">重要</span>
            )}
            <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString('ja-JP')}</span>
          </div>
          <h1 className="text-lg font-bold text-white">{a.title}</h1>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{a.body}</div>
        </DarkCardBody>
      </DarkCard>
    </div>
  )
}
