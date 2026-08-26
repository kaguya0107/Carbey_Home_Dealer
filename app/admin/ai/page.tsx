import { requireStaffAi } from '@/lib/portal/ai-gate'
import { getAiInstruction, HQ_AI_INSTRUCTIONS_KEY } from '@/lib/portal/editable-notes'
import AdminAiChatPanel from '@/components/admin/AdminAiChatPanel'
import HqAiInstructionsEditor from '@/components/admin/HqAiInstructionsEditor'

export const dynamic = 'force-dynamic'

export default async function AdminAiPage() {
  await requireStaffAi()
  const hqInstructions = await getAiInstruction(HQ_AI_INSTRUCTIONS_KEY)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">AI分析・壁打ち</h1>
        <p className="mt-1 text-sm text-slate-500">
          規約・料金表に沿った<strong>クレーム対応（できる／できないの判定）</strong>を軸に、対応文の下書き・市場分析・経営の壁打ちができます。
        </p>
      </div>
      <HqAiInstructionsEditor initial={hqInstructions} />
      <AdminAiChatPanel />
    </div>
  )
}
