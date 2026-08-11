'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Lock, Loader2, ChevronDown, Clock, ArrowDown, ArrowRight } from 'lucide-react'
import { completeTaskAction } from '@/app/portal/onboarding/actions'
import type { OnboardingStep } from '@/lib/portal/onboarding'
import type { OnboardingTaskRow } from '@/types/database'

/** link_key → 対応する手続きページ（実体で自動達成される導線）。 */
const LINK_HREF: Record<string, string> = {
  identity: '/portal/onboarding/evidence',
  antique_license: '/portal/onboarding/evidence',
  funding: '/portal/onboarding/funding',
  terms: '/portal/terms',
  manual: '/portal/onboarding/manual',
}

/**
 * フローチャート型・ゲート式オンボーディング（加盟店向け）。
 * ステップを縦フローで表示し、前ステップ完了まで次はロック（飛ばせない）。
 * auto タスクは加盟店が「完了する」で自己完了、manual は本部確認中。
 */
export default function OnboardingFlow({ steps }: { steps: OnboardingStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={step.key}>
          <StepNode step={step} index={i} />
          {i < steps.length - 1 && (
            <div className="flex justify-center py-1">
              <ArrowDown className={`h-5 w-5 ${step.status === 'done' ? 'text-brand-500' : 'text-carbon-600'}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StepNode({ step, index }: { step: OnboardingStep; index: number }) {
  const [open, setOpen] = useState(step.status === 'current')
  const locked = step.locked
  const done = step.status === 'done'
  const current = step.status === 'current'

  const nodeColor = done
    ? 'bg-brand-500 text-white'
    : current
      ? 'border-2 border-brand-500 bg-brand-500/15 text-brand-400'
      : locked
        ? 'border-2 border-carbon-700 bg-carbon-900 text-slate-600'
        : 'border-2 border-carbon-600 bg-carbon-800 text-slate-500'

  return (
    <div
      className={`rounded-xl border ${
        current ? 'border-brand-500/40 glow-brand' : locked ? 'border-carbon-700 opacity-60' : 'border-carbon-700'
      } bg-carbon-850/80`}
    >
      {/* ヘッダー（ステップ見出し） */}
      <button
        onClick={() => !locked && setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        disabled={locked}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${nodeColor}`}>
          {done ? <CheckCircle2 className="h-5 w-5" /> : locked ? <Lock className="h-4 w-4" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">STEP {index + 1}</span>
            {done && <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">完了</span>}
            {current && <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">進行中</span>}
            {locked && <span className="rounded bg-carbon-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">ロック中</span>}
          </div>
          <div className="text-sm font-bold text-white">{step.label}</div>
        </div>
        <span className="shrink-0 text-xs text-slate-500">{step.done}/{step.total}</span>
        {!locked && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />}
      </button>

      {/* ロック中の説明 */}
      {locked && (
        <div className="border-t border-carbon-700 px-4 py-2.5 text-xs text-slate-500">
          <Lock className="mr-1 inline h-3 w-3" /> 前のステップを完了すると解放されます。
        </div>
      )}

      {/* タスク一覧（展開時） */}
      {open && !locked && (
        <div className="border-t border-carbon-700 px-4 py-3">
          <ul className="space-y-2">
            {step.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task }: { task: OnboardingTaskRow }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const done = task.status === 'done'
  const href = task.link_key ? LINK_HREF[task.link_key] : undefined

  const onComplete = () => {
    setError('')
    start(async () => {
      const res = await completeTaskAction(task.id)
      if (!res.ok) setError(res.error ?? '完了できませんでした')
    })
  }

  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-carbon-700 bg-carbon-800/40 px-3 py-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-400" />
      ) : task.completion_type === 'manual' && !href ? (
        <Clock className="h-4 w-4 shrink-0 text-amber-400" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-full border border-carbon-600" />
      )}
      <span className={`flex-1 text-sm ${done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
        {task.title}
        {task.optional && (
          <span className="ml-1.5 rounded bg-carbon-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">任意</span>
        )}
      </span>

      {done ? (
        <span className="text-[11px] text-slate-600">完了</span>
      ) : href ? (
        // 実体で自動達成されるタスク：対応する手続きページへ誘導
        <Link
          href={href}
          className="flex items-center gap-1 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/20"
        >
          手続きへ <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : task.completion_type === 'manual' ? (
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">本部確認中</span>
      ) : (
        <button
          onClick={onComplete}
          disabled={pending}
          className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '完了する'}
        </button>
      )}
      {error && <span className="text-[11px] text-rose-400">{error}</span>}
    </li>
  )
}
