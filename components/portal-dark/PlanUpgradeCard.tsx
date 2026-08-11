import Link from 'next/link'
import { Sparkles, ArrowUpRight, Check } from 'lucide-react'
import type { PlanRow } from '@/types/database'
import { yen } from '@/lib/portal/labels'

/**
 * #31 加盟者向け：上位プランのアップグレード紹介。
 * 現在のプランより上位（display_order が大きい・有効）のプランを、主な機能つきで案内する。
 */
export default function PlanUpgradeCard({
  plans,
  currentCode,
  currentName,
}: {
  plans: PlanRow[]
  currentCode: string | null
  currentName: string | null
}) {
  const currentOrder = plans.find((p) => p.code === currentCode)?.display_order ?? -1
  const higher = plans
    .filter((p) => p.is_active && p.display_order > currentOrder)
    .sort((a, b) => a.display_order - b.display_order)
  if (higher.length === 0) return null

  const perks = (p: PlanRow): string[] => {
    const list: string[] = []
    if (p.has_auto) list.push('全自動売買（フルオート）')
    if (p.default_auto_slots > 0) list.push(`自動売買 初期${p.default_auto_slots}枠`)
    if (p.feature_ai) list.push('AI分析・相場')
    if (p.feature_crm) list.push('CRM（顧客管理）')
    if (list.length === 0) list.push('半自動売買')
    return list
  }

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-carbon-900/40 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand-400" />
        <h2 className="text-sm font-bold text-white">プランのアップグレード</h2>
        {currentName && <span className="text-xs text-slate-400">現在のプラン：{currentName}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {higher.map((p) => (
          <div key={p.id} className="rounded-xl border border-carbon-700 bg-carbon-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">{p.name}</span>
              <span className="text-[11px] text-slate-400">月額 {yen(p.monthly_fee_yen)}</span>
            </div>
            {p.description && <p className="mt-1 text-[11px] text-slate-500">{p.description}</p>}
            <ul className="mt-2 space-y-1">
              {perks(p).map((x) => (
                <li key={x} className="flex items-center gap-1.5 text-xs text-slate-300"><Check className="h-3 w-3 shrink-0 text-brand-400" />{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-brand-400" />
        アップグレードをご希望の場合は、<Link href="/portal/chat" className="text-brand-300 hover:underline">本部へご相談</Link>ください。
      </div>
    </div>
  )
}
