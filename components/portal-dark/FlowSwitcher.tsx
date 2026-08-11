'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat, Bot, Hand, Loader2 } from 'lucide-react'
import { switchFlowAction } from '@/app/portal/onboarding/flow-actions'
import type { FlowType } from '@/types/database'

/**
 * フロー切替（レビュー⑳）。両モデル保有（フルオート）の加盟店のみ表示。
 * semi=半自動売買（手動操作）/ auto=自動売買。切替後はそのフローのマニュアルで進む。
 */
export default function FlowSwitcher({ current, canSwitch }: { current: FlowType; canSwitch: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  if (!canSwitch) return null

  const choose = (flow: FlowType) => {
    if (flow === current) return
    setError('')
    start(async () => {
      const r = await switchFlowAction(flow)
      if (!r.ok) setError(r.error ?? '')
      else router.refresh() // 選択を画面へ即時反映（⑤：切り替えても画面が変わらない対策）
    })
  }

  return (
    <div className="rounded-xl border border-carbon-700 bg-carbon-850/80 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <Repeat className="h-4 w-4 text-brand-400" /> 売買フローの切り替え
      </div>
      <p className="mb-3 text-xs text-slate-400">
        ご契約プランは自動売買・半自動売買の両方に対応しています。実行するフローを選べます。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => choose('auto')}
          disabled={pending}
          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
            current === 'auto' ? 'border-brand-500 bg-brand-500/10' : 'border-carbon-600 hover:bg-white/5'
          }`}
        >
          <Bot className={`h-5 w-5 ${current === 'auto' ? 'text-brand-400' : 'text-slate-500'}`} />
          <span className="text-sm font-semibold text-white">自動売買</span>
          <span className="text-[11px] text-slate-400">AIが自動で進めるフロー</span>
          {current === 'auto' && <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">実行中</span>}
        </button>
        <button
          onClick={() => choose('semi')}
          disabled={pending}
          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
            current === 'semi' ? 'border-brand-500 bg-brand-500/10' : 'border-carbon-600 hover:bg-white/5'
          }`}
        >
          <Hand className={`h-5 w-5 ${current === 'semi' ? 'text-brand-400' : 'text-slate-500'}`} />
          <span className="text-sm font-semibold text-white">半自動売買</span>
          <span className="text-[11px] text-slate-400">ご自身で判断・操作するフロー</span>
          {current === 'semi' && <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">実行中</span>}
        </button>
      </div>
      {pending && <p className="mt-2 flex items-center gap-1 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> 切り替え中…</p>}
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  )
}
