import Link from 'next/link'
import { Tag, ArrowRight, Zap } from 'lucide-react'
import type { SellingVehicle } from '@/lib/portal/direct-pricing'

/**
 * ⑳ ダイレクトプライシングへのショートカット（露出強化）。
 * 販売中車両があるときだけ表示。TOP・半自動・自動などの各画面から AI相談ページの
 * ダイレクトプライシングへワンタップで遷移できる。呼び出し側で AI 利用可否を確認して描画する。
 */
export default function DirectPricingShortcut({
  vehicles,
  href = '/portal/ai#direct-pricing',
}: {
  vehicles: SellingVehicle[]
  href?: string
}) {
  if (vehicles.length === 0) return null
  const onCount = vehicles.filter((v) => v.directPricingOn).length

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-brand-500/10 px-4 py-3 transition hover:border-amber-400/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
        <Tag className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          ダイレクトプライシングで早期売却
          {onCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              <Zap className="h-3 w-3" /> 設定中 {onCount}台
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400">
          販売中 {vehicles.length}台。想定価格の順位と、すぐ下の競合価格（URL付き）を確認して値付けできます。
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-amber-300 transition group-hover:translate-x-0.5" />
    </Link>
  )
}
