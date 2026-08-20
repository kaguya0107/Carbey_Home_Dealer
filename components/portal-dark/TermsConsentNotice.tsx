'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'
import { consentAction } from '@/app/portal/terms/actions'

/**
 * ⑬ 利用規約の同意がスルーされないよう、お知らせ等に常設する同意バナー。
 * 未同意のあいだ表示し、その場で（全文リンク付きで）同意できる。
 */
export default function TermsConsentNotice({ version, title }: { version: number; title: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()

  const agree = () => {
    setError('')
    start(async () => {
      const r = await consentAction()
      if (r.ok) router.refresh()
      else setError(r.error ?? '同意の記録に失敗しました')
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-200">利用規約の同意が必要です</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
            現在の利用規約（{title}・v{version}）にまだ同意されていません。内容をご確認のうえ、同意をお願いします。
            同意いただくまで一部機能に制限がかかる場合があります。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={agree}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              内容を確認して同意する
            </button>
            <Link href="/portal/terms" className="text-xs text-amber-200 underline underline-offset-2 hover:text-amber-100">
              規約の全文・別添を読む
            </Link>
          </div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  )
}
