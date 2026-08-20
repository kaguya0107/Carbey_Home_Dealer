'use client'

import { useState, useTransition } from 'react'
import { SlidersHorizontal, Loader2, Check } from 'lucide-react'
import { saveMemberAiInstructionsAction } from '@/app/portal/ai/actions'

/**
 * ⑫ 加盟者が自分の好みに合わせてAIへの指示（プロンプト）を入力・保存する。
 * 保存内容は以降のAI相談の回答方針として反映される。
 */
export default function MemberAiInstructionsEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const save = () => {
    setError('')
    setSaved(false)
    start(async () => {
      const r = await saveMemberAiInstructionsAction(text)
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else setError(r.error ?? '保存に失敗しました')
    })
  }

  return (
    <details className="rounded-xl border border-carbon-700 bg-carbon-800/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-200 marker:content-none">
        <SlidersHorizontal className="h-4 w-4 text-brand-400" />
        AIへの指示（あなた専用の設定）
        <span className="ml-2 text-xs font-normal text-slate-500">回答のトーンや形式をお好みに合わせられます</span>
        <span className="ml-auto text-xs text-slate-500">タップで開閉</span>
      </summary>
      <div className="space-y-2 border-t border-carbon-700 px-4 py-3">
        <p className="text-xs text-slate-400">
          ここに書いた内容は、あなたのAI相談の回答方針として毎回参照されます。
          例：「結論から簡潔に」「数字は表で」「軽自動車中心に見ている」「毎回、次の一手も提案して」など。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="回答の好み・前提・重視したい観点などを自由に入力…"
          className="w-full resize-y rounded-lg border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            保存
          </button>
          {saved && <span className="text-xs text-emerald-400">保存しました。次回以降の回答に反映されます。</span>}
          {error && <span className="text-xs text-rose-400">{error}</span>}
        </div>
      </div>
    </details>
  )
}
