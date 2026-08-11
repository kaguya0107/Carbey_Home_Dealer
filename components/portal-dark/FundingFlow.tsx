'use client'

import { useState, useTransition } from 'react'
import { Wallet, Banknote, CheckCircle2, Lock, Clock, Loader2, ArrowDown } from 'lucide-react'
import { chooseMethodAction, setSelfAmountAction, completeStepAction } from '@/app/portal/onboarding/funding/actions'
import { LOAN_STEPS } from '@/lib/portal/funding'
import type { FundingRow } from '@/types/database'

/** 資金準備フロー（自己資金 / 資金調達 の分岐）。 */
export default function FundingFlow({ funding }: { funding: FundingRow | null }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const choose = (method: 'self' | 'loan') => {
    setError('')
    start(async () => { const r = await chooseMethodAction(method); if (!r.ok) setError(r.error ?? '') })
  }

  // 方法未選択
  if (!funding?.method) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">開業資金の準備方法を選択してください。</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => choose('self')} disabled={pending} className="flex flex-col items-start gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-4 text-left transition hover:border-brand-500/40 hover:bg-brand-500/10">
            <Wallet className="h-6 w-6 text-brand-400" />
            <div className="text-sm font-semibold text-white">自己資金で始める</div>
            <div className="text-xs text-slate-400">自己資金額を登録して本部確認を受けます。</div>
          </button>
          <button onClick={() => choose('loan')} disabled={pending} className="flex flex-col items-start gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-4 text-left transition hover:border-brand-500/40 hover:bg-brand-500/10">
            <Banknote className="h-6 w-6 text-brand-400" />
            <div className="text-sm font-semibold text-white">資金調達を利用する</div>
            <div className="text-xs text-slate-400">申請から着金まで本部がサポートします。</div>
          </button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    )
  }

  return funding.method === 'self' ? <SelfFlow funding={funding} /> : <LoanFlow funding={funding} />
}

/* ---------- 自己資金 ---------- */
function SelfFlow({ funding }: { funding: FundingRow }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const registered = funding.self_amount_yen != null
  const confirmed = funding.self_confirmed

  const submit = (fd: FormData) => {
    setError('')
    start(async () => { const r = await setSelfAmountAction(fd); if (!r.ok) setError(r.error ?? '') })
  }

  return (
    <div className="space-y-3">
      <StepRow n={1} label="自己資金額を登録" done={registered} current={!registered}>
        <form action={submit} className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
            <input name="amount" inputMode="numeric" defaultValue={funding.self_amount_yen ?? ''} placeholder="1000000"
              className="w-full rounded-lg border border-carbon-600 bg-carbon-900 py-2 pl-7 pr-3 text-sm text-slate-100 focus:border-brand-500 focus:outline-none" />
          </div>
          <button disabled={pending} className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : registered ? '更新' : '登録'}
          </button>
        </form>
      </StepRow>
      <Arrow done={registered} />
      <StepRow n={2} label="本部確認" done={confirmed} current={registered && !confirmed}
        hint={registered && !confirmed ? '本部の確認をお待ちください' : undefined} />
      <Arrow done={confirmed} />
      <StepRow n={3} label="完了" done={confirmed} current={false} />
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}

/* ---------- 資金調達（loan） ---------- */
function LoanFlow({ funding }: { funding: FundingRow }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  // 前ステップ完了までロック
  let prevDone = true
  return (
    <div className="space-y-3">
      {LOAN_STEPS.map((step, i) => {
        const done = funding.step_status?.[step.key] === 'done'
        const locked = !prevDone && !done
        const current = prevDone && !done
        const el = (
          <div key={step.key}>
            <StepRow
              n={i + 1}
              label={step.label}
              done={done}
              current={current}
              locked={locked}
              hint={step.actor === 'admin' && current ? '本部が対応します' : undefined}
            >
              {current && step.actor === 'member' && !done && (
                <button
                  onClick={() => { setError(''); start(async () => { const r = await completeStepAction(step.key); if (!r.ok) setError(r.error ?? '') }) }}
                  disabled={pending}
                  className="mt-2 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '完了する'}
                </button>
              )}
            </StepRow>
            {i < LOAN_STEPS.length - 1 && <Arrow done={done} />}
          </div>
        )
        prevDone = prevDone && done
        return el
      })}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}

/* ---------- 共通 ---------- */
function StepRow({ n, label, done, current, locked, hint, children }: {
  n: number; label: string; done: boolean; current: boolean; locked?: boolean; hint?: string; children?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${current ? 'border-brand-500/40 bg-brand-500/5' : locked ? 'border-carbon-800 bg-carbon-900/40 opacity-60' : 'border-carbon-700 bg-carbon-800/40'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? 'bg-brand-500 text-white' : current ? 'border border-brand-500 text-brand-400' : locked ? 'text-slate-600' : 'border border-carbon-600 text-slate-500'
        }`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <Lock className="h-3 w-3" /> : n}
        </span>
        <span className={`flex-1 text-sm ${done ? 'text-slate-400' : locked ? 'text-slate-500' : 'text-slate-200'}`}>{label}</span>
        {hint && <span className="flex items-center gap-1 text-[11px] text-amber-400"><Clock className="h-3 w-3" />{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Arrow({ done }: { done: boolean }) {
  return <div className="flex justify-center py-0.5"><ArrowDown className={`h-4 w-4 ${done ? 'text-brand-500' : 'text-carbon-600'}`} /></div>
}
