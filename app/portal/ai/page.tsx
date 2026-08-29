import { Info } from 'lucide-react'
import { requireMemberAi } from '@/lib/portal/ai-gate'
import { getRemainingSearches, getEffectiveAiConfig, getMemberAiInstructions } from '@/lib/portal/ai-config'
import { getNote } from '@/lib/portal/editable-notes'
import { listConversations, getMostRecentConversation, listMessages, messagesToPanel } from '@/lib/portal/ai-conversations'
import { listSellingVehicles } from '@/lib/portal/direct-pricing'
import AiChatPanel from '@/components/portal-dark/AiChatPanel'
import MemberAiInstructionsEditor from '@/components/portal-dark/MemberAiInstructionsEditor'
import DirectPricingPanel from '@/components/portal-dark/DirectPricingPanel'

export const dynamic = 'force-dynamic'

export default async function MemberAiPage({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const { member } = await requireMemberAi()
  const { deal: dealParam } = await searchParams
  const [{ remaining, allocated }, cfg, notice, instructions, convRows, recent, sellingVehicles] = await Promise.all([
    getRemainingSearches(member.id),
    getEffectiveAiConfig(member.id),
    getNote('member_ai_notice'),
    getMemberAiInstructions(member.id),
    listConversations(member.id),
    getMostRecentConversation(member.id), // ⑱ 遷移後に直近会話を復元
    listSellingVehicles(member.id), // ⑳ ダイレクトプライシング対象（販売中車両）
  ])
  const expansions = { image: cfg.imageEnabled, deep: cfg.deepEnabled, docgen: cfg.docgenEnabled }
  const conversations = convRows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, pinned: !!r.pinned_at }))
  const recentMessages = recent ? messagesToPanel(await listMessages(recent.id)) : []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">AI相談・相場分析</h1>
        <p className="text-sm text-slate-400">
          相場・仕入れ・値付け・経営の相談に加え、システムの使い方や、規約・料金表に基づく対応可否（対応可能／対応不可）も案内します。
        </p>
      </div>

      {notice && notice.body.trim() && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <div>
            {notice.title && <div className="text-sm font-medium text-slate-200">{notice.title}</div>}
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{notice.body}</p>
          </div>
        </div>
      )}

      <MemberAiInstructionsEditor initial={instructions} />

      <DirectPricingPanel vehicles={sellingVehicles} initialDealId={dealParam} />

      <AiChatPanel
        initialRemaining={remaining}
        allocated={allocated}
        expansions={expansions}
        initialConversations={conversations}
        initialConversationId={recent?.id ?? null}
        initialMessages={recentMessages}
      />
    </div>
  )
}
