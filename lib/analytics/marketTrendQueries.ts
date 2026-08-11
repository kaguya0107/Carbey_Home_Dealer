/**
 * 市場トレンド (時系列) 取得ヘルパ。
 *
 * 対象は migration 039 で作成した append-only テーブル:
 *   - market_daily_metrics  (1 run × 車種 × 地域 = 1 行; 全国行は region_prefecture = null)
 *
 * 既存の marketAnalyticsQueries.ts が「最新 run の断面」を返すのに対し、
 * 本ファイルは「複数 run にまたがる時系列」を返す。AI のトレンド系 Tool が利用する。
 *
 * 取得頻度は ~3日に1回 (Vercel Hobby) のため、データ点は不等間隔。
 * 期間指定は日数 (days) で受け、snapshot_date >= now - days で絞る。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE = 'market_daily_metrics'

export type TrendPoint = {
  snapshot_date: string
  region_prefecture: string | null
  listing_count: number
  median_price_yen: number | null
  avg_price_yen: number | null
  min_price_yen: number | null
  max_price_yen: number | null
  median_mileage_km: number | null
}

function sinceIso(days: number): string {
  const d = new Date(Date.now() - days * 86400_000)
  return d.toISOString().slice(0, 10) // date 列なので YYYY-MM-DD
}

/** 全国行 (region_prefecture is null) のみ返す共通フィルタ。region 指定時はその地域行。 */
function applyRegion<T>(q: T, region?: string): T {
  // region 未指定 = 全国行 (null)。Supabase は .is('col', null) で null 一致。
  return (region
    ? (q as any).eq('region_prefecture', region)
    : (q as any).is('region_prefecture', null)) as T
}

/**
 * 価格トレンド: 指定車種(+地域)の median/avg 価格を時系列で返す (古い順)。
 * 「最近ヤリスは値下がりしてる?」のような質問に使う。
 */
export async function fetchPriceTrend(
  client: SupabaseClient,
  opts: { car_name: string; region?: string; days?: number },
): Promise<TrendPoint[]> {
  const days = opts.days ?? 90
  let q = (client.from as any)(TABLE)
    .select(
      'snapshot_date, region_prefecture, listing_count, median_price_yen, avg_price_yen, min_price_yen, max_price_yen, median_mileage_km',
    )
    .eq('car_name', opts.car_name)
    .gte('snapshot_date', sinceIso(days))
  q = applyRegion(q, opts.region)
  const { data, error } = await q.order('snapshot_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as TrendPoint[]
}

/**
 * 在庫件数トレンド: listing_count を時系列で返す (古い順)。
 * ※ like-for-like 比較のため criteria_hash が揃った run のみを対象にしたいが、
 *   現状は単一テンプレ運用前提。将来テンプレが分岐したら criteria_hash で絞る。
 */
export async function fetchInventoryTrend(
  client: SupabaseClient,
  opts: { car_name: string; region?: string; days?: number },
): Promise<TrendPoint[]> {
  // メトリクスは同一テーブルなので価格トレンドと同形。呼び出し側で listing_count を使う。
  return fetchPriceTrend(client, opts)
}

export type RegionTrendRow = {
  region_prefecture: string
  first_date: string
  last_date: string
  first_count: number
  last_count: number
  count_change: number
  first_median_price_yen: number | null
  last_median_price_yen: number | null
  price_change_yen: number | null
}

/**
 * 地域トレンド比較: 指定車種について、各地域の「期間始点 → 終点」の在庫件数・中央価格の変化を返す。
 * 「どの地域が強い?」を時系列の変化量で答えるための集計。
 */
export async function fetchRegionalTrend(
  client: SupabaseClient,
  opts: { car_name: string; regions?: string[]; days?: number },
): Promise<RegionTrendRow[]> {
  const days = opts.days ?? 90
  let q = (client.from as any)(TABLE)
    .select('snapshot_date, region_prefecture, listing_count, median_price_yen')
    .eq('car_name', opts.car_name)
    .gte('snapshot_date', sinceIso(days))
    .not('region_prefecture', 'is', null) // 地域別行のみ (全国行は除外)
  if (opts.regions && opts.regions.length > 0) {
    q = q.in('region_prefecture', opts.regions)
  }
  const { data, error } = await q.order('snapshot_date', { ascending: true })
  if (error) throw error

  type Row = {
    snapshot_date: string
    region_prefecture: string
    listing_count: number
    median_price_yen: number | null
  }
  const rows = (data ?? []) as Row[]

  // 地域ごとに最初と最後の点を取り出して変化量を出す
  const byRegion = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byRegion.get(r.region_prefecture) ?? []
    arr.push(r)
    byRegion.set(r.region_prefecture, arr)
  }

  const out: RegionTrendRow[] = []
  for (const [region, arr] of byRegion) {
    if (arr.length === 0) continue
    const first = arr[0]
    const last = arr[arr.length - 1]
    out.push({
      region_prefecture: region,
      first_date: first.snapshot_date,
      last_date: last.snapshot_date,
      first_count: first.listing_count,
      last_count: last.listing_count,
      count_change: last.listing_count - first.listing_count,
      first_median_price_yen: first.median_price_yen,
      last_median_price_yen: last.median_price_yen,
      price_change_yen:
        last.median_price_yen != null && first.median_price_yen != null
          ? last.median_price_yen - first.median_price_yen
          : null,
    })
  }
  // 在庫増加量の大きい順 (= 勢いのある地域)
  out.sort((a, b) => b.count_change - a.count_change)
  return out
}

export type RisingModelRow = {
  car_name: string
  first_date: string
  last_date: string
  first_count: number
  last_count: number
  count_change: number
  count_change_pct: number | null
  last_median_price_yen: number | null
}

/**
 * 人気上昇車種: 全国行 (region null) を使い、期間始点→終点で在庫件数の増加が大きい車種を返す。
 * 「最近どの車種が伸びてる?」に答える。
 * ※ 在庫件数の増加は「市場での出回り増」を意味する。需要そのものではない点に注意 (回転率と併読推奨)。
 */
export async function fetchRisingModels(
  client: SupabaseClient,
  opts: { region?: string; days?: number; limit?: number },
): Promise<RisingModelRow[]> {
  const days = opts.days ?? 60
  let q = (client.from as any)(TABLE)
    .select('car_name, snapshot_date, region_prefecture, listing_count, median_price_yen')
    .gte('snapshot_date', sinceIso(days))
  q = applyRegion(q, opts.region)
  const { data, error } = await q.order('snapshot_date', { ascending: true })
  if (error) throw error

  type Row = {
    car_name: string
    snapshot_date: string
    listing_count: number
    median_price_yen: number | null
  }
  const rows = (data ?? []) as Row[]

  const byCar = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byCar.get(r.car_name) ?? []
    arr.push(r)
    byCar.set(r.car_name, arr)
  }

  const out: RisingModelRow[] = []
  for (const [car, arr] of byCar) {
    if (arr.length < 2) continue // 変化を測るには最低2点必要
    const first = arr[0]
    const last = arr[arr.length - 1]
    const change = last.listing_count - first.listing_count
    out.push({
      car_name: car,
      first_date: first.snapshot_date,
      last_date: last.snapshot_date,
      first_count: first.listing_count,
      last_count: last.listing_count,
      count_change: change,
      count_change_pct:
        first.listing_count > 0
          ? Math.round((change / first.listing_count) * 1000) / 10
          : null,
      last_median_price_yen: last.median_price_yen,
    })
  }
  out.sort((a, b) => b.count_change - a.count_change)
  return out.slice(0, opts.limit ?? 15)
}
