'use client'

import { useState, useTransition } from 'react'
import { Search, Plus, X, Loader2, AlertTriangle, Info } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { PREFECTURES } from '@/lib/portal/market-snapshot'
import type { ScopeFilter, ScopeResult } from '@/lib/portal/market-analysis'
import { runAnalysisAction } from '@/app/admin/market-snapshot/analysis/actions'

type FormFilter = {
  carName: string
  keyword: string
  prefecture: string
  yearMin: string
  yearMax: string
  priceMinMan: string
  priceMaxMan: string
  dateFrom: string
  dateTo: string
}

const EMPTY: FormFilter = { carName: '', keyword: '', prefecture: '', yearMin: '', yearMax: '', priceMinMan: '', priceMaxMan: '', dateFrom: '', dateTo: '' }

const numOrU = (s: string) => (s.trim() === '' ? undefined : Number(s))
function toScopeFilter(f: FormFilter): ScopeFilter {
  return {
    carName: f.carName.trim() || undefined,
    keyword: f.keyword.trim() || undefined,
    prefecture: f.prefecture || undefined,
    yearMin: numOrU(f.yearMin),
    yearMax: numOrU(f.yearMax),
    priceMinMan: numOrU(f.priceMinMan),
    priceMaxMan: numOrU(f.priceMaxMan),
    dateFrom: f.dateFrom || undefined,
    dateTo: f.dateTo || undefined,
  }
}
function scopeLabel(f: FormFilter): string {
  const parts = [f.carName.trim() || '全車種', f.prefecture || '全国']
  if (f.keyword.trim()) parts.push(`「${f.keyword.trim()}」`)
  if (f.yearMin || f.yearMax) parts.push(`${f.yearMin || ''}〜${f.yearMax || ''}年`)
  if (f.priceMinMan || f.priceMaxMan) parts.push(`${f.priceMinMan || ''}〜${f.priceMaxMan || ''}万`)
  if (f.dateFrom || f.dateTo) parts.push(`収集 ${f.dateFrom || ''}〜${f.dateTo || ''}`)
  return parts.join(' / ')
}

const SCOPES = [
  { key: 'A', accent: 'brand', ring: 'ring-brand-200', bar: 'bg-brand-400', text: 'text-brand-700', dot: 'bg-brand-500' },
  { key: 'B', accent: 'violet', ring: 'ring-violet-200', bar: 'bg-violet-400', text: 'text-violet-700', dot: 'bg-violet-500' },
] as const

export default function MarketAnalysisPanel({ initialPrefecture }: { initialPrefecture?: string } = {}) {
  const [filterA, setFilterA] = useState<FormFilter>({ ...EMPTY, prefecture: initialPrefecture ?? '' })
  const [filterB, setFilterB] = useState<FormFilter>({ ...EMPTY })
  const [showB, setShowB] = useState(false)
  const [resultA, setResultA] = useState<ScopeResult | null>(null)
  const [resultB, setResultB] = useState<ScopeResult | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setError(null)
    start(async () => {
      const [ra, rb] = await Promise.all([
        runAnalysisAction(toScopeFilter(filterA)),
        showB ? runAnalysisAction(toScopeFilter(filterB)) : Promise.resolve(null),
      ])
      if (!ra.ok) { setError(ra.error); return }
      setResultA(ra.result)
      if (rb === null) setResultB(null)
      else if (!rb.ok) { setError(rb.error); return }
      else setResultB(rb.result)
    })
  }

  const results = [resultA, showB ? resultB : null] as const
  const filters = [filterA, filterB] as const

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className={`grid grid-cols-1 gap-4 ${showB ? 'lg:grid-cols-2' : ''}`}>
        <ScopeForm scopeIdx={0} value={filterA} onChange={setFilterA} onRemove={null} />
        {showB && <ScopeForm scopeIdx={1} value={filterB} onChange={setFilterB} onRemove={() => { setShowB(false); setResultB(null) }} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {showB ? '突合分析する' : '範囲分析する'}
        </button>
        {!showB && (
          <button
            type="button"
            onClick={() => setShowB(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> 比較対象を追加（突合）
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {resultA && <Results filters={filters} results={results} />}
    </div>
  )
}

function ScopeForm({
  scopeIdx,
  value,
  onChange,
  onRemove,
}: {
  scopeIdx: 0 | 1
  value: FormFilter
  onChange: (f: FormFilter) => void
  onRemove: (() => void) | null
}) {
  const s = SCOPES[scopeIdx]
  const set = (k: keyof FormFilter, v: string) => onChange({ ...value, [k]: v })
  const input = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none'

  return (
    <Card className={`ring-1 ${s.ring}`}>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${s.text}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} /> 対象{s.key}
          </span>
          {onRemove && (
            <button type="button" onClick={onRemove} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="この比較対象を削除">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs text-slate-500">
            車種（部分一致）
            <input value={value.carName} onChange={(e) => set('carName', e.target.value)} placeholder="例）プリウス" className={`mt-1 ${input}`} />
          </label>
          <label className="block text-xs text-slate-500">
            地域
            <select value={value.prefecture} onChange={(e) => set('prefecture', e.target.value)} className={`mt-1 ${input}`}>
              <option value="">全国</option>
              {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-xs text-slate-500">
          キーワード（車種名・グレード・メーカー・色を横断検索）
          <input value={value.keyword} onChange={(e) => set('keyword', e.target.value)} placeholder="例）ハイブリッド／4WD／黒／レクサス など" className={`mt-1 ${input}`} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-slate-500">年式（西暦）</div>
            <div className="mt-1 flex items-center gap-1">
              <input value={value.yearMin} onChange={(e) => set('yearMin', e.target.value)} inputMode="numeric" placeholder="下限" className={input} />
              <span className="text-slate-400">〜</span>
              <input value={value.yearMax} onChange={(e) => set('yearMax', e.target.value)} inputMode="numeric" placeholder="上限" className={input} />
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">価格（万円・本体）</div>
            <div className="mt-1 flex items-center gap-1">
              <input value={value.priceMinMan} onChange={(e) => set('priceMinMan', e.target.value)} inputMode="numeric" placeholder="下限" className={input} />
              <span className="text-slate-400">〜</span>
              <input value={value.priceMaxMan} onChange={(e) => set('priceMaxMan', e.target.value)} inputMode="numeric" placeholder="上限" className={input} />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">
            収集期間（任意）
            <span className="ml-1 text-[10px] text-slate-400">指定すると30日を超える蓄積データも対象（重複除去：期間内で最新の1件）</span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <input type="date" value={value.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} className={input} />
            <span className="text-slate-400">〜</span>
            <input type="date" value={value.dateTo} onChange={(e) => set('dateTo', e.target.value)} className={input} />
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

const man = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('ja-JP')}万`)

function Results({
  filters,
  results,
}: {
  filters: readonly [FormFilter, FormFilter]
  results: readonly [ScopeResult | null, ScopeResult | null]
}) {
  const active = SCOPES.map((s, i) => ({ s, i, r: results[i], f: filters[i] })).filter((x) => x.r) as {
    s: (typeof SCOPES)[number]
    i: number
    r: ScopeResult
    f: FormFilter
  }[]
  const sampled = active.some((x) => x.r.count > x.r.sampleSize)
  const periodBased = active.some((x) => x.r.periodBased)

  const metricRows: { label: string; get: (r: ScopeResult) => string }[] = [
    { label: '件数', get: (r) => r.count.toLocaleString('ja-JP') + '件' },
    { label: '価格 中央値', get: (r) => man(r.price?.median) },
    { label: '価格 25〜75%', get: (r) => (r.price ? `${man(r.price.p25)}〜${man(r.price.p75)}` : '—') },
    { label: '価格 最小〜最大', get: (r) => (r.price ? `${man(r.price.min)}〜${man(r.price.max)}` : '—') },
    { label: '価格 平均', get: (r) => man(r.price?.avg) },
    { label: '年式 中央値', get: (r) => (r.yearMedian != null ? `${r.yearMedian}年` : '—') },
    { label: '年式 範囲', get: (r) => (r.yearMin != null ? `${r.yearMin}〜${r.yearMax}年` : '—') },
    { label: '走行 中央値', get: (r) => (r.mileageMedianKm != null ? `${r.mileageMedianKm.toLocaleString('ja-JP')}km` : '—') },
  ]

  const histMax = Math.max(1, ...active.flatMap((x) => x.r.priceHistogram.map((h) => h.count)))

  return (
    <div className="space-y-4">
      {/* 指標比較表 */}
      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">指標</th>
                  {active.map((x) => (
                    <th key={x.s.key} className="px-4 py-3 font-medium">
                      <span className={`flex items-center gap-1.5 ${x.s.text}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${x.s.dot}`} /> 対象{x.s.key}
                      </span>
                      <span className="text-xs font-normal text-slate-400">{scopeLabel(x.f)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metricRows.map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{row.label}</td>
                    {active.map((x) => (
                      <td key={x.s.key} className="px-4 py-2.5 font-medium tabular-nums text-slate-800">{row.get(x.r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* 価格分布 + 内訳 */}
      <div className={`grid grid-cols-1 gap-4 ${active.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {active.map((x) => (
          <Card key={x.s.key}>
            <CardBody className="space-y-4">
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${x.s.text}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${x.s.dot}`} /> 対象{x.s.key} の価格分布
              </div>
              {x.r.priceHistogram.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">分布を出せる件数がありません。</div>
              ) : (
                <div className="space-y-1.5">
                  {x.r.priceHistogram.map((h) => (
                    <div key={h.label} className="flex items-center gap-2">
                      <div className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">{h.label}</div>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                        <div className={`h-full ${x.s.bar}`} style={{ width: `${Math.round((h.count / histMax) * 100)}%` }} />
                      </div>
                      <div className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{h.count}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <div className="mb-1 text-xs text-slate-400">地域内訳（上位）</div>
                  {x.r.topRegions.length === 0 ? <div className="text-xs text-slate-400">—</div> : x.r.topRegions.map((t) => (
                    <div key={t.region} className="flex justify-between text-xs text-slate-600"><span>{t.region}</span><span className="tabular-nums text-slate-400">{t.count}</span></div>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-400">車種内訳（上位）</div>
                  {x.r.topCars.length === 0 ? <div className="text-xs text-slate-400">—</div> : x.r.topCars.map((t) => (
                    <div key={t.car} className="flex justify-between text-xs text-slate-600"><span className="truncate pr-1" title={t.car}>{t.car}</span><span className="tabular-nums text-slate-400">{t.count}</span></div>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {periodBased ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          収集期間を指定したため、直近30日ではなく<strong className="font-semibold">蓄積データ全体</strong>を対象に集計しています。同一車両の期間内重複は<strong className="font-semibold">最新の1件に除去</strong>済みです（対象は各最大1,000件・件数はその除去後の値）。
        </div>
      ) : sampled ? (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          件数が多いため、価格・年式・走行の統計は最新の一部サンプル（各最大1,000件）から算出しています。件数（総数）は正確な値です。
        </div>
      ) : null}
    </div>
  )
}
