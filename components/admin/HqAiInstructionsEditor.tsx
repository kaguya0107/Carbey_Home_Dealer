'use client'

import { useState, useTransition } from 'react'
import { Settings2, Loader2, Check } from 'lucide-react'
import { saveHqAiInstructionsAction } from '@/app/admin/ai/actions'

/**
 * ⑫ 本部AIへの指示・ナレッジ（プロンプト）を編集する。
 * 保存内容は本部AIの回答方針として system prompt 末尾に反映される（画面には表示されない）。
 */
export default function HqAiInstructionsEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const save = () => {
    setError('')
    setSaved(false)
    start(async () => {
      const r = await saveHqAiInstructionsAction(text)
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else setError(r.error ?? '保存に失敗しました')
    })
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 marker:content-none">
        <Settings2 className="h-4 w-4 text-brand-500" />
        本部AIへの指示・ナレッジ（プロンプト）
        <span className="ml-2 text-xs font-normal text-slate-400">
          チャット担当・SVの入力作業向けに、対応方針や社内ナレッジを学習させます
        </span>
        <span className="ml-auto text-xs text-slate-400">クリックで開閉</span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-4 py-3">
        <p className="text-xs text-slate-500">
          ここに書いた内容は本部AIの回答方針として常に参照されます（加盟店には表示されません）。
          現行の利用規約・別添（料金表）はAIが自動で参照するため、ここには<strong>規約に載っていない契約上の特記事項・
          クレーム対応の運用基準・エスカレーション先</strong>などを補足すると精度が上がります。
          例：「規約外の全額返金は不可、代替は再整備」「クレームは3営業日以内に一次回答」「重大案件は◯◯へエスカレーション」など。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="本部AIに覚えさせたい方針・ナレッジ・言い回しなどを自由に入力…"
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            保存
          </button>
          {saved && <span className="text-xs text-emerald-600">保存しました。次回以降の回答に反映されます。</span>}
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </div>
    </details>
  )
}
