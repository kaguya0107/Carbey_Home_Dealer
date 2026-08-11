import Link from 'next/link'
import { ArrowLeft, BookOpen, CheckCircle2, Lock } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { getMemberManual } from '@/lib/portal/manual'
import { DarkCard, DarkCardHeader, DarkCardBody } from '@/components/portal-dark/DarkUI'
import { DarkProgressRing } from '@/components/portal-dark/DarkCharts'
import ManualChecklist from '@/components/portal-dark/ManualChecklist'

export const dynamic = 'force-dynamic'

export default async function ManualPage() {
  const session = await requireMember()
  const manual = await getMemberManual(session.userId)

  if (!manual) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        会員情報が紐付いていません。本部にお問い合わせください。
      </div>
    )
  }

  const pct = manual.total ? Math.round((manual.done / manual.total) * 100) : 0
  const completed = manual.total > 0 && manual.done === manual.total

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal/onboarding" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> オンボーディングへ戻る
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <BookOpen className="h-5 w-5 text-brand-400" /> 実践マニュアル
          </h1>
          <p className="text-sm text-slate-400">各項目を確認し、すべてチェックすると修了です。</p>
        </div>
        <DarkProgressRing pct={pct} size={64} />
      </div>

      {completed && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-300">
          <CheckCircle2 className="h-4 w-4" /> 実践マニュアルを修了しました。
        </div>
      )}

      <DarkCard>
        <DarkCardHeader
          title="マニュアル項目"
          action={<span className="text-xs text-slate-500">{manual.done}/{manual.total} 完了</span>}
        />
        <DarkCardBody>
          {manual.sections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
              <Lock className="h-6 w-6" />
              <span className="text-sm">マニュアルは準備中です。公開までお待ちください。</span>
            </div>
          ) : (
            <ManualChecklist sections={manual.sections} />
          )}
        </DarkCardBody>
      </DarkCard>
    </div>
  )
}
