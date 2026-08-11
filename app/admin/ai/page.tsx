import { requireStaffAi } from '@/lib/portal/ai-gate'
import AdminAiChatPanel from '@/components/admin/AdminAiChatPanel'

export const dynamic = 'force-dynamic'

export default async function AdminAiPage() {
  await requireStaffAi()

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">AI分析・壁打ち</h1>
        <p className="mt-1 text-sm text-slate-500">
          カーセンサーの市場データと業界知識で、市場分析・カスタマー対応の下書き・経営の壁打ちができます。
        </p>
      </div>
      <AdminAiChatPanel />
    </div>
  )
}
