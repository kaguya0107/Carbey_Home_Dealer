import Link from 'next/link'
import { ArrowLeft, ShieldCheck, ScrollText, Info } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { listOwnEvidences } from '@/lib/portal/evidence'
import { DarkCard, DarkCardHeader, DarkCardBody } from '@/components/portal-dark/DarkUI'
import EvidenceUploader from '@/components/portal-dark/EvidenceUploader'

export const dynamic = 'force-dynamic'

export default async function EvidencePage() {
  const session = await requireMember()
  const own = await listOwnEvidences(session.userId)

  if (!own) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        会員情報が紐付いていません。本部にお問い合わせください。
      </div>
    )
  }

  const identity = own.items.filter((e) => e.kind === 'identity')
  const antique = own.items.filter((e) => e.kind === 'antique_license')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portal/onboarding" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> オンボーディングへ戻る
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white">本人確認・書類の提出</h1>
        <p className="text-sm text-slate-400">提出した書類は本部が確認し、承認されると次に進めます。</p>
      </div>

      {/* 本人確認（必須） */}
      <DarkCard>
        <DarkCardHeader
          title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-400" /> 本人確認（必須）</span>}
          action={<span className="rounded bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-400">必須</span>}
        />
        <DarkCardBody className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-carbon-700 bg-carbon-800/40 px-3 py-2 text-xs text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>顔写真付きの身分証（<span className="text-slate-200">運転免許証・マイナンバーカード・パスポート</span>のいずれか）を提出してください。</span>
          </div>
          <EvidenceUploader kind="identity" items={identity} />
        </DarkCardBody>
      </DarkCard>

      {/* 古物商許可証（任意・6ヶ月猶予） */}
      <DarkCard>
        <DarkCardHeader
          title={<span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-violet-400" /> 古物商許可証</span>}
          action={<span className="rounded bg-carbon-700 px-2 py-0.5 text-[10px] font-semibold text-slate-400">任意・6ヶ月以内</span>}
        />
        <DarkCardBody className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-carbon-700 bg-carbon-800/40 px-3 py-2 text-xs text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>古物商許可証は<span className="text-slate-200">未取得でもスタートできます</span>。取得後6ヶ月以内にアップロードしてください（取得に約2ヶ月かかります）。</span>
          </div>
          <EvidenceUploader kind="antique_license" items={antique} />
        </DarkCardBody>
      </DarkCard>
    </div>
  )
}
