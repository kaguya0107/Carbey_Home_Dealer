/**
 * 市場分析の集計取得ヘルパ。
 *
 * 対象は migration 022/023 で作成された materialized view:
 *   - market_price_distribution
 *   - market_popularity
 *   - market_turnover
 * および 021 で作成された table:
 *   - sold_estimations
 *
 * これらは types/database.ts に未登録のため、service role client から
 * .from(MV_NAME as any) でアクセスする。型は本ファイル内で明示する。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type PopularityRow = {
  car_name: string
  region_prefecture: string | null
  color: string
  count: number
  pct: number
}

export type TurnoverRow = {
  car_name: string
  region_prefecture: string | null
  sold_count: number
  avg_days: number
  median_days: number
  min_days: number
  max_days: number
}

export type PriceDistributionRow = {
  car_name: string
  region_prefecture: string | null
  price_bucket: number
  count: number
  avg_price: number
  median_price: number
  min_price: number
  max_price: number
}

export type SoldRecentRow = {
  cs_stock_id: string
  car_name: string | null
  maker: string | null
  region_prefecture: string | null
  disappeared_at: string
  estimated_days_to_sell: number | null
  last_price_body_yen: number | null
  last_color: string | null
}

/** service role でしか叩けない MV/Table を読むので、第一引数は service role client。 */
export async function fetchPopularity(
  client: SupabaseClient,
  opts: { car_name?: string; region?: string },
): Promise<PopularityRow[]> {
  let q = (client.from as any)('market_popularity').select('*')
  if (opts.car_name) q = q.eq('car_name', opts.car_name)
  if (opts.region) q = q.eq('region_prefecture', opts.region)
  const { data, error } = await q.order('pct', { ascending: false })
  if (error) throw error
  return (data ?? []) as PopularityRow[]
}

export async function fetchTurnover(
  client: SupabaseClient,
  opts: { car_name?: string; region?: string },
): Promise<TurnoverRow[]> {
  let q = (client.from as any)('market_turnover').select('*')
  if (opts.car_name) q = q.eq('car_name', opts.car_name)
  if (opts.region) q = q.eq('region_prefecture', opts.region)
  const { data, error } = await q.order('sold_count', { ascending: false })
  if (error) throw error
  return (data ?? []) as TurnoverRow[]
}

export async function fetchPriceDistribution(
  client: SupabaseClient,
  opts: { car_name?: string; region?: string },
): Promise<PriceDistributionRow[]> {
  let q = (client.from as any)('market_price_distribution').select('*')
  if (opts.car_name) q = q.eq('car_name', opts.car_name)
  if (opts.region) q = q.eq('region_prefecture', opts.region)
  const { data, error } = await q.order('price_bucket', { ascending: true })
  if (error) throw error
  return (data ?? []) as PriceDistributionRow[]
}

/**
 * cs_market_observations を最新成功 run のみで直接フィルタしてフェッチする。
 * MV は (car_name, region, color) 単位で集計済みなので、年式や価格範囲で絞り込む場合は
 * 元データを直接読む必要がある。
 */
export type FilteredObservation = {
  cs_stock_id: string
  car_name: string | null
  region_prefecture: string | null
  color: string | null
  model_year: number | null
  price_body_yen: number | null
  mileage_km: number | null
}

export async function fetchFilteredObservations(
  client: SupabaseClient,
  opts: {
    car_name?: string
    region?: string
    year_min?: number
    year_max?: number
    price_min_yen?: number
    price_max_yen?: number
    mileage_max_km?: number
    limit?: number
  },
): Promise<FilteredObservation[]> {
  // 最新成功 run の id を取得
  const { data: runRow } = await (client.from as any)('cs_market_snapshot_runs')
    .select('id')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!runRow) return []
  const runId = runRow.id

  let q = (client.from as any)('cs_market_observations')
    .select(
      'cs_stock_id, car_name, region_prefecture, color, model_year, price_body_yen, mileage_km',
    )
    .eq('snapshot_run_id', runId)
  if (opts.car_name) q = q.eq('car_name', opts.car_name)
  if (opts.region) q = q.eq('region_prefecture', opts.region)
  if (opts.year_min != null) q = q.gte('model_year', opts.year_min)
  if (opts.year_max != null) q = q.lte('model_year', opts.year_max)
  if (opts.price_min_yen != null) q = q.gte('price_body_yen', opts.price_min_yen)
  if (opts.price_max_yen != null) q = q.lte('price_body_yen', opts.price_max_yen)
  if (opts.mileage_max_km != null) q = q.lte('mileage_km', opts.mileage_max_km)
  const { data, error } = await q.limit(opts.limit ?? 5000)
  if (error) throw error
  return (data ?? []) as FilteredObservation[]
}

export async function fetchSoldRecent(
  client: SupabaseClient,
  opts: { days: number; car_name?: string; region?: string; limit?: number },
): Promise<SoldRecentRow[]> {
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString()
  let q = (client.from as any)('sold_estimations')
    .select(
      'cs_stock_id, car_name, maker, region_prefecture, disappeared_at, estimated_days_to_sell, last_price_body_yen, last_color',
    )
    .gte('disappeared_at', since)
  if (opts.car_name) q = q.eq('car_name', opts.car_name)
  if (opts.region) q = q.eq('region_prefecture', opts.region)
  const { data, error } = await q
    .order('disappeared_at', { ascending: false })
    .limit(opts.limit ?? 500)
  if (error) throw error
  return (data ?? []) as SoldRecentRow[]
}

export type SoldBreakdownRow = {
  cs_stock_id: string
  car_name: string | null
  grade: string | null
  model_year: number | null
  last_color: string | null
  last_price_body_yen: number | null
  mileage_km: number | null
  estimated_days_to_sell: number | null
  region_prefecture: string | null
  disappeared_at: string
}

/**
 * 売却推定の詳細内訳を取得する。
 * グレード・年式・色・価格帯・走行距離での分析に使用。
 * 「プリウス30後期と50前期の割合」「黒の価格帯」などの壁打ちに対応。
 */
export async function fetchSoldBreakdown(
  client: SupabaseClient,
  opts: {
    car_name: string
    region?: string
    days?: number
    year_min?: number
    year_max?: number
    grade?: string
    color?: string
    mileage_max_km?: number
    limit?: number
  },
): Promise<SoldBreakdownRow[]> {
  const since = opts.days
    ? new Date(Date.now() - opts.days * 86400_000).toISOString()
    : new Date(Date.now() - 90 * 86400_000).toISOString() // デフォルト90日

  let q = (client.from as any)('sold_estimations')
    .select(
      'cs_stock_id, car_name, grade, model_year, last_color, last_price_body_yen, mileage_km, estimated_days_to_sell, region_prefecture, disappeared_at',
    )
    .eq('car_name', opts.car_name)
    .gte('disappeared_at', since)

  if (opts.region) q = q.eq('region_prefecture', opts.region)
  if (opts.year_min != null) q = q.gte('model_year', opts.year_min)
  if (opts.year_max != null) q = q.lte('model_year', opts.year_max)
  if (opts.grade) q = q.ilike('grade', `%${opts.grade}%`)
  if (opts.color) q = q.eq('last_color', opts.color)
  if (opts.mileage_max_km != null) q = q.lte('mileage_km', opts.mileage_max_km)

  const { data, error } = await q
    .order('disappeared_at', { ascending: false })
    .limit(opts.limit ?? 2000)
  if (error) throw error
  return (data ?? []) as SoldBreakdownRow[]
}
