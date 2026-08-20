// 市場スナップショット 突合分析・範囲分析（本部・P3）— recent_market_observations（30日ローリング）で集計。
//
// 範囲分析＝1スコープの価格帯/年式/地域分布を集計。突合分析＝複数スコープを同一指標で並べて比較。
// 市場データ規約に従い、最新1runではなく30日ローリングのビューを直接読む（get_market_overview と同基盤）。
// ※ 価格中央値等は最大1000件のサンプルで算出（PostgREST既定の上限）。件数(count)は head で正確に取得し、
//   count > sampleSize のときは「サンプル集計」である旨をUIで明示する。

import { createPublicReadClient } from '@/lib/supabase/admin'

const OBS = 'recent_market_observations'
const SAMPLE_LIMIT = 1000

export type ScopeFilter = {
  carName?: string
  prefecture?: string // 未指定=全国
  yearMin?: number
  yearMax?: number
  priceMinMan?: number // 万円
  priceMaxMan?: number // 万円
  keyword?: string // ⑧ キーワード（車種名・グレード・メーカー・色を横断部分一致）
  // ③ 期間指定（JSTの日付 YYYY-MM-DD）。指定時は30日ローリングではなく累積データを対象にする。
  dateFrom?: string
  dateTo?: string
}

export type PriceStats = {
  min: number
  p25: number
  median: number
  p75: number
  max: number
  avg: number
} // すべて万円

export type ScopeResult = {
  count: number // 正確な総件数（head）
  sampleSize: number // 統計に使ったサンプル件数
  price: PriceStats | null
  yearMedian: number | null
  yearMin: number | null
  yearMax: number | null
  mileageMedianKm: number | null
  priceHistogram: { label: string; from: number; to: number; count: number }[] // 万円バケット
  topRegions: { region: string; count: number }[]
  topCars: { car: string; count: number }[]
  periodBased: boolean // true=期間指定・累積データ（重複除去済み）／false=直近30日ローリング
}

function applyFilter<T>(q: T, f: ScopeFilter): T {
  // 型を緩めて連鎖（public テーブルは Database 型に未登録）
  let query = q as unknown as {
    ilike: (c: string, v: string) => typeof query
    eq: (c: string, v: string) => typeof query
    gte: (c: string, v: number) => typeof query
    lte: (c: string, v: number) => typeof query
    not: (c: string, op: string, v: null) => typeof query
    or: (v: string) => typeof query
  }
  if (f.carName?.trim()) query = query.ilike('car_name', `%${f.carName.trim()}%`)
  if (f.prefecture?.trim()) query = query.eq('region_prefecture', f.prefecture.trim())
  if (f.yearMin != null) query = query.gte('model_year', f.yearMin)
  if (f.yearMax != null) query = query.lte('model_year', f.yearMax)
  if (f.priceMinMan != null) query = query.gte('price_body_yen', f.priceMinMan * 10_000)
  if (f.priceMaxMan != null) query = query.lte('price_body_yen', f.priceMaxMan * 10_000)
  // ⑧ キーワード＝車種名・グレード・メーカー・色を横断して部分一致（OR）。
  //   .or() を壊す文字（, ( ) *）は除去してから組み立てる。
  const kw = f.keyword?.trim().replace(/[,()*]/g, ' ').trim()
  if (kw) {
    query = query.or(
      `car_name.ilike.*${kw}*,grade.ilike.*${kw}*,maker.ilike.*${kw}*,color.ilike.*${kw}*`,
    )
  }
  return query as unknown as T
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const yen2man = (y: number) => Math.round(y / 10_000)

type SampleRow = {
  price_body_yen: number | null
  price_total_yen: number | null
  model_year: number | null
  mileage_km: number | null
  region_prefecture: string | null
  car_name: string | null
}

const DAY_MS = 86_400_000

/**
 * ③ 期間指定の累積データ集計。cs_market_observations は巨大（約150万件）で、広い期間を1クエリで
 * 走査すると statement timeout になるため、新しい側から一定日数ずつ「区切って」取得する。
 * 各 cs_stock_id は最初に出会った（＝最新の）1件だけ採用して重複除去する（期間内最新ルール）。
 */
async function fetchPeriodDeduped(filter: ScopeFilter): Promise<SampleRow[]> {
  const client = createPublicReadClient()
  const CHUNK_MS = 7 * DAY_MS // 1区切り=7日（狭くして timeout を避ける）
  const MAX_CHUNKS = 8 // 走査上限（暴走防止・最新側から最大約56日）
  const toMs = filter.dateTo ? Date.parse(`${filter.dateTo}T23:59:59.999+09:00`) : Date.now()
  const fromMs = filter.dateFrom
    ? Date.parse(`${filter.dateFrom}T00:00:00+09:00`)
    : toMs - MAX_CHUNKS * CHUNK_MS

  const seen = new Set<string>()
  const out: SampleRow[] = []
  let cursorTo = toMs
  for (let i = 0; i < MAX_CHUNKS && out.length < SAMPLE_LIMIT && cursorTo > fromMs; i++) {
    const cursorFrom = Math.max(fromMs, cursorTo - CHUNK_MS)
    let q = client
      .from('cs_market_observations')
      .select('cs_stock_id, price_body_yen, price_total_yen, model_year, mileage_km, region_prefecture, car_name')
      .not('price_body_yen', 'is', null)
    q = applyFilter(q, filter)
    q = (q as unknown as {
      gte: (c: string, v: string) => typeof q
      lte: (c: string, v: string) => typeof q
    }).gte('fetched_at', new Date(cursorFrom).toISOString()).lte('fetched_at', new Date(cursorTo).toISOString()) as typeof q
    const { data, error } = await q.order('fetched_at', { ascending: false }).limit(SAMPLE_LIMIT)
    if (error) {
      // 巨大テーブルのフィルタ走査がタイムアウト。中途半端な件数を返さず、明確に失敗を通知する。
      throw new Error('指定期間の集計がタイムアウトしました。期間を短く（目安2週間以内）するか、車種・地域で絞ってお試しください。（広い期間の高速集計には市場データへのインデックス追加が必要です）')
    }
    for (const r of (data ?? []) as Array<SampleRow & { cs_stock_id: string | null }>) {
      const id = r.cs_stock_id
      if (id && !seen.has(id)) { seen.add(id); out.push(r) }
    }
    cursorTo = cursorFrom
  }
  return out
}

/**
 * 1スコープの範囲集計。
 * ・期間指定なし：直近30日ローリング（recent_market_observations・件数はhead正確）。
 * ・期間指定あり（③）：累積データ（cs_market_observations）を対象。期間内は各 cs_stock_id の
 *   最新1件へ重複除去して集計（同一車両の期間内重複を排除）。
 */
export async function analyzeScope(filter: ScopeFilter): Promise<ScopeResult> {
  const client = createPublicReadClient()
  const usePeriod = !!(filter.dateFrom || filter.dateTo)

  if (usePeriod) {
    const deduped = await fetchPeriodDeduped(filter)
    return buildResult(deduped, deduped.length, true)
  }

  // 正確な件数（価格ありのみ）
  let countQ = client.from(OBS).select('*', { count: 'exact', head: true }).not('price_body_yen', 'is', null)
  countQ = applyFilter(countQ, filter)
  const { count } = await countQ

  // 統計サンプル
  let sampleQ = client
    .from(OBS)
    .select('price_body_yen, price_total_yen, model_year, mileage_km, region_prefecture, car_name')
    .not('price_body_yen', 'is', null)
  sampleQ = applyFilter(sampleQ, filter)
  // cs_stock_id 順で取得（地域や価格と無相関のため、スコープが1000件超でも偏りの少ない代表サンプルになる）。
  // fetched_at 降順だと直近スクレイプの都道府県にサンプルが偏るため使わない。
  const { data: rows } = await sampleQ.order('cs_stock_id', { ascending: true }).limit(SAMPLE_LIMIT)

  return buildResult((rows ?? []) as unknown as SampleRow[], count ?? (rows?.length ?? 0), false)
}

/** サンプル配列＋件数から集計結果を組み立てる（30日ローリング／期間指定 共通）。 */
function buildResult(sample: SampleRow[], count: number, periodBased: boolean): ScopeResult {
  const sampleSize = sample.length

  const prices = sample
    .map((r) => (r.price_body_yen as number | null) ?? (r.price_total_yen as number | null))
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .map(yen2man)
    .sort((a, b) => a - b)

  const years = sample
    .map((r) => r.model_year as number | null)
    .filter((v): v is number => typeof v === 'number' && v > 1950)
    .sort((a, b) => a - b)

  const mileages = sample
    .map((r) => r.mileage_km as number | null)
    .filter((v): v is number => typeof v === 'number' && v >= 0)
    .sort((a, b) => a - b)

  const price: PriceStats | null = prices.length
    ? {
        min: prices[0],
        p25: Math.round(percentile(prices, 0.25)),
        median: Math.round(percentile(prices, 0.5)),
        p75: Math.round(percentile(prices, 0.75)),
        max: prices[prices.length - 1],
        avg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
      }
    : null

  // 地域内訳・車種内訳（サンプルから上位）
  const tally = (key: 'region_prefecture' | 'car_name') => {
    const m = new Map<string, number>()
    for (const r of sample) {
      const v = (r[key] as string | null) ?? null
      if (v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }

  // 価格ヒストグラム（サンプルから。0〜上位95%を6〜8区間に）
  const priceHistogram: ScopeResult['priceHistogram'] = []
  if (prices.length >= 5) {
    const hiCap = Math.round(percentile(prices, 0.95))
    const lo = prices[0]
    const span = Math.max(1, hiCap - lo)
    const buckets = 8
    const width = Math.max(10, Math.ceil(span / buckets / 10) * 10) // 10万円単位に丸め
    for (let i = 0; i < buckets; i++) {
      const from = lo + i * width
      const to = from + width
      const c = prices.filter((p) => p >= from && (i === buckets - 1 ? p <= prices[prices.length - 1] : p < to)).length
      if (c > 0) priceHistogram.push({ label: `${from}〜${to}万`, from, to, count: c })
    }
  }

  return {
    count,
    sampleSize,
    price,
    yearMedian: years.length ? Math.round(percentile(years, 0.5)) : null,
    yearMin: years.length ? years[0] : null,
    yearMax: years.length ? years[years.length - 1] : null,
    mileageMedianKm: mileages.length ? Math.round(percentile(mileages, 0.5)) : null,
    priceHistogram,
    topRegions: tally('region_prefecture').map(([region, c]) => ({ region, count: c })),
    topCars: tally('car_name').map(([car, c]) => ({ car, count: c })),
    periodBased,
  }
}
