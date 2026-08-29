'use client'

import { useState, useTransition } from 'react'
import { Tag, ExternalLink, Loader2, Zap } from 'lucide-react'
import { runDirectPricingAction, clearDirectPricingAction } from '@/app/portal/ai/actions'
import type { SellingVehicle, DpResult } from '@/lib/portal/direct-pricing'

/**
 * ⑳ 簡易ダイレクトプライシング。販売中車両の想定価格を入力し、カーセンサー掲載データ内の順位と
 * 安い方の競合5件（URL付き）を表示。設定中は deal にフラグが立ち、案件ボードにも表示される。
 */
export default function DirectPricingPanel({ vehicles, initialDealId }: { vehicles: SellingVehicle[]; initialDealId?: string }) {
  const [selectedId, setSelectedId] = useState(
    (initialDealId && vehicles.some((v) => v.id === initialDealId) ? initialDealId : vehicles[0]?.id) ?? '',
  )
  const initial = vehicles.find((v) => v.id === selectedId)
  const [priceMan, setPriceMan] = useState(initial?.targetYen ? String(Math.round(initial.targetYen / 10_000)) : '')
  const [on, setOn] = useState(!!initial?.directPricingOn)
  const [result, setResult] = useState<DpResult | null>(null)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  if (vehicles.length === 0) return null

  const sel = vehicles.find((v) => v.id === selectedId)

  function pickVehicle(id: string) {
    setSelectedId(id)
    const v = vehicles.find((x) => x.id === id)
    setPriceMan(v?.targetYen ? String(Math.round(v.targetYen / 10_000)) : '')
    setOn(!!v?.directPricingOn)
    setResult(null)
    setErr('')
  }

  const run = () => {
    const man = Number(priceMan)
    if (!man || man <= 0) { setErr('想定販売価格（万円）を入力してください'); return }
    setErr('')
    start(async () => {
      const r = await runDirectPricingAction(selectedId, Math.round(man * 10_000))
      if (r.ok && r.result) { setResult(r.result); setOn(true) }
      else setErr(r.error ?? '算出に失敗しました')
    })
  }
  const clear = () => start(async () => {
    const r = await clearDirectPricingAction(selectedId)
    if (r.ok) { setOn(false); setResult(null) }
  })

  const input = 'rounded-lg border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

  return (
    <div id="direct-pricing" className="scroll-mt-20 rounded-xl border border-carbon-700 bg-carbon-850/80 p-4">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-brand-400" />
        <span className="text-sm font-semibold text-slate-200">ダイレクトプライシング（早期売却の価格判断）</span>
        {on && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            <Zap className="h-3 w-3" /> 設定中
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        販売中車両の想定価格が、カーセンサー掲載内で何番手かを算出し、すぐ下の競合（安い順）を表示します。早期売却の値付け判断にお使いください。
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {vehicles.length > 1 && (
          <label className="text-xs text-slate-400">
            対象車両
            <select value={selectedId} onChange={(e) => pickVehicle(e.target.value)} className={`mt-1 block ${input}`}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
        )}
        {vehicles.length === 1 && sel && (
          <div className="text-xs text-slate-400">対象車両<div className="mt-1 text-sm font-medium text-slate-200">{sel.label}</div></div>
        )}
        <label className="text-xs text-slate-400">
          想定販売価格（万円・本体）
          <div className="mt-1 flex items-center gap-1">
            <input value={priceMan} onChange={(e) => setPriceMan(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="例）350" className={`w-28 ${input}`} />
            <span className="text-slate-500 text-sm">万円</span>
          </div>
        </label>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
          価格ターゲットを表示
        </button>
        {on && (
          <button type="button" onClick={clear} disabled={pending} className="rounded-lg border border-carbon-600 px-3 py-2 text-xs text-slate-400 hover:bg-carbon-800">
            設定を解除
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-rose-400">{err}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-carbon-700 bg-carbon-900/60 px-3 py-2 text-sm">
            <span className="text-slate-300">{result.carLabel}</span>
            <span className="text-slate-400">想定 <span className="font-semibold text-brand-300">{result.targetMan}万</span></span>
            <span className="text-slate-400">
              掲載 {result.total}件中 <span className="font-semibold text-white">{result.rank}番手</span>（安い順）
            </span>
            {result.medianMan != null && <span className="text-slate-500">中央 {result.medianMan}万</span>}
          </div>

          {result.total === 0 ? (
            <p className="text-xs text-slate-500">同条件のカーセンサー掲載が見つかりませんでした。車種名・年式をご確認ください。</p>
          ) : result.cheaper.length === 0 ? (
            <p className="text-xs text-emerald-400">想定価格より安い競合はありません（現状で最安値グループです）。</p>
          ) : (
            <div>
              <div className="mb-1.5 text-xs text-slate-400">すぐ下の価格ターゲット（想定価格より安い競合・近い順 最大5件）</div>
              <ul className="space-y-1.5">
                {result.cheaper.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-carbon-700 bg-carbon-900/40 px-3 py-2 text-xs">
                    <span className="w-16 shrink-0 font-semibold text-brand-300">{c.priceMan}万</span>
                    <span className="min-w-0 flex-1 truncate text-slate-400">
                      {[c.year ? `${c.year}年` : null, c.mileageKm != null ? `${(c.mileageKm / 10000).toFixed(1)}万km` : null, c.region, c.dealer].filter(Boolean).join(' / ')}
                    </span>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-brand-400 hover:underline">
                        掲載を見る <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="shrink-0 text-slate-600">URLなし</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">
                これらより安く設定すると順位が上がり、早期売却につながりやすくなります。※対象車両自体はカーセンサーには掲載されません。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
