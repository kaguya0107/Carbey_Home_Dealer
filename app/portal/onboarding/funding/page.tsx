import Link from 'next/link'
import { ArrowLeft, Wallet, CheckCircle2 } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { getOwnFunding } from '@/lib/portal/funding'
import { DarkCard, DarkCardHeader, DarkCardBody } from '@/components/portal-dark/DarkUI'
import FundingFlow from '@/components/portal-dark/FundingFlow'

export const dynamic = 'force-dynamic'

export default async function FundingPage() {
  const session = await requireMember()
  const result = await getOwnFunding(session.userId)

  if (!result) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        会員情報が紐付いていません。本部にお問い合わせください。
      </div>
    )
  }

  const funding = result.funding
  const completed = funding?.status === 'completed'
  const methodLabel = funding?.method === 'self' ? '自己資金' : funding?.method === 'loan' ? '資金調達' : '未選択'

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal/onboarding" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> オンボーディングへ戻る
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Wallet className="h-5 w-5 text-brand-400" /> 資金準備
        </h1>
        <p className="text-sm text-slate-400">開業資金の準備方法を選び、手続きを進めてください。</p>
      </div>

      {completed && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-300">
          <CheckCircle2 className="h-4 w-4" /> 資金準備が完了しました。
        </div>
      )}

      <DarkCard>
        <DarkCardHeader
          title="資金準備フロー"
          action={<span className="text-xs text-slate-500">{methodLabel}</span>}
        />
        <DarkCardBody>
          <FundingFlow funding={funding} />
        </DarkCardBody>
      </DarkCard>
    </div>
  )
}
