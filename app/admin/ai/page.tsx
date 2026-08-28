import { requireStaffAi } from '@/lib/portal/ai-gate'
import { getAiInstruction, HQ_AI_INSTRUCTIONS_KEY } from '@/lib/portal/editable-notes'
import { listConversations, getMostRecentConversation, listMessages, messagesToPanel } from '@/lib/portal/ai-conversations'
import AdminAiChatPanel from '@/components/admin/AdminAiChatPanel'
import HqAiInstructionsEditor from '@/components/admin/HqAiInstructionsEditor'

export const dynamic = 'force-dynamic'

export default async function AdminAiPage() {
  await requireStaffAi()
  const [hqInstructions, convRows, recent] = await Promise.all([
    getAiInstruction(HQ_AI_INSTRUCTIONS_KEY),
    listConversations(null),
    getMostRecentConversation(null), // ⑱ 直近会話を復元
  ])
  const conversations = convRows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, pinned: !!r.pinned_at }))
  const recentMessages = recent ? messagesToPanel(await listMessages(recent.id)) : []

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">AI分析・壁打ち</h1>
        <p className="mt-1 text-sm text-slate-500">
          規約・料金表に沿った<strong>クレーム対応（できる／できないの判定）</strong>を軸に、対応文の下書き・市場分析・経営の壁打ちができます。
        </p>
      </div>
      <HqAiInstructionsEditor initial={hqInstructions} />
      <AdminAiChatPanel
        initialConversations={conversations}
        initialConversationId={recent?.id ?? null}
        initialMessages={recentMessages}
      />
    </div>
  )
}
