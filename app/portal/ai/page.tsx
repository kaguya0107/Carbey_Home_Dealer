import { Info } from 'lucide-react'
import { requireMemberAi } from '@/lib/portal/ai-gate'
import { getRemainingSearches, getEffectiveAiConfig } from '@/lib/portal/ai-config'
import { getNote } from '@/lib/portal/editable-notes'
import AiChatPanel from '@/components/portal-dark/AiChatPanel'

export const dynamic = 'force-dynamic'

export default async function MemberAiPage() {
  const { member } = await requireMemberAi()
  const [{ remaining, allocated }, cfg, notice] = await Promise.all([
    getRemainingSearches(member.id),
    getEffectiveAiConfig(member.id),
    getNote('member_ai_notice'),
  ])
  const expansions = { image: cfg.imageEnabled, deep: cfg.deepEnabled, docgen: cfg.docgenEnabled }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">AI相談・相場分析</h1>
        <p className="text-sm text-slate-400">
          カーセンサーの市場データと業界知識で、相場・仕入れ・値付け・経営の相談ができます。
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

      <AiChatPanel initialRemaining={remaining} allocated={allocated} expansions={expansions} />
    </div>
  )
}
