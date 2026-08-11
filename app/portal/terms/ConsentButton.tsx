'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { consentAction } from './actions'

/** 利用規約への同意ボタン。押下で同意を記録する。 */
export default function ConsentButton() {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  return (
    <div>
      <button
        onClick={() => { setError(''); start(async () => { const r = await consentAction(); if (!r.ok) setError(r.error ?? '') }) }}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white glow-brand transition hover:bg-brand-600 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        利用規約に同意する
      </button>
      {error && <p className="mt-2 text-center text-xs text-rose-400">{error}</p>}
    </div>
  )
}
