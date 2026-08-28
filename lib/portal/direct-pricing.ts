// ⑳ 簡易ダイレクトプライシング。
// 半自動売買の販売中車両について、加盟者が入力した想定価格が、カーセンサー掲載データ内で何番手かを算出し、
// 安い方の競合（価格ターゲット）を提示して早期売却の価格判断を促す。市場データは30日ローリングを使用。

import { createServiceRoleClient, createPublicReadClient } from '@/lib/supabase/admin'

const OBS = 'recent_market_observations'
const yen2man = (y: number) => Math.round(y / 10_000)

export type SellingVehicle = {
  id: string
  maker: string | null
  carModel: string | null
  year: string | null
  label: string
  directPricingOn: boolean
  targetYen: number | null
}

export type DpCompetitor = {
  priceMan: number
  year: number | null
  mileageKm: number | null
  dealer: string | null
  region: string | null
  url: string | null
}

export type DpResult = {
  carLabel: string
  targetMan: number
  rank: number // 想定価格の順位（安い順で何番手か）
  total: number // 同条件の掲載件数
  medianMan: number | null
  cheaper: DpCompetitor[] // 想定価格より安い競合（近い順・最大5件）
}

/** 加盟者の販売中（listing）車両一覧＋ダイレクトプライシング状態。 */
export async function listSellingVehicles(memberId: string): Promise<SellingVehicle[]> {
  const sb = createServiceRoleClient()
  const { data, error } = await sb
    .from('vehicle_deals')
    .select('id, maker, car_model, year, direct_pricing_at, direct_pricing_target_yen')
    .eq('member_id', memberId)
    .eq('status', 'listing')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  type Row = { id: string; maker: string | null; car_model: string | null; year: string | null; direct_pricing_at: string | null; direct_pricing_target_yen: number | null }
  return ((data ?? []) as Row[]).map((d) => ({
    id: d.id,
    maker: d.maker,
    carModel: d.car_model,
    year: d.year,
    label: [d.maker, d.car_model, d.year ? `${d.year}年` : null].filter(Boolean).join(' ') || '販売中車両',
    directPricingOn: !!d.direct_pricing_at,
    targetYen: d.direct_pricing_target_yen,
  }))
}

/** 想定価格に対する順位と、安い方の競合（価格ターゲット）を算出。掲載データは掲載URL付きで返す。 */
export async function computeDirectPricing(
  vehicle: { maker: string | null; carModel: string | null; year: string | null },
  targetYen: number,
): Promise<DpResult> {
  const pub = createPublicReadClient()
  const carLabel = [vehicle.maker, vehicle.carModel, vehicle.year ? `${vehicle.year}年` : null].filter(Boolean).join(' ') || '対象車両'
  const model = vehicle.carModel?.trim() || vehicle.maker?.trim() || ''
  const yearNum = vehicle.year && /^\d{4}$/.test(vehicle.year) ? Number(vehicle.year) : null

  // PostgREST は既定で最大1000行のため、順位・件数は head count で正確に取得する（行フェッチしない）。
  type Q = {
    ilike: (c: string, v: string) => Q
    gte: (c: string, v: number) => Q
    lte: (c: string, v: number) => Q
    lt: (c: string, v: number) => Q
    order: (c: string, o: { ascending: boolean }) => Q
    range: (a: number, b: number) => Q
    not: (c: string, op: string, v: null) => Q
  }
  const base = (select: string, opts?: { count: 'exact'; head: true }) => {
    let q = pub.from(OBS).select(select, opts) as unknown as Q
    q = q.not('price_body_yen', 'is', null)
    if (model) q = q.ilike('car_name', `%${model}%`)
    if (yearNum) q = q.gte('model_year', yearNum - 1).lte('model_year', yearNum + 1)
    return q
  }

  // 総件数・想定価格より安い件数（順位）
  const { count: totalCount } = (await base('*', { count: 'exact', head: true })) as unknown as { count: number | null }
  const { count: belowCount } = (await (base('*', { count: 'exact', head: true }).lt('price_body_yen', targetYen))) as unknown as { count: number | null }
  const total = totalCount ?? 0
  const rank = (belowCount ?? 0) + 1

  // 中央値：昇順で total/2 番目の1行だけ取得（正確・軽量）
  let medianMan: number | null = null
  if (total > 0) {
    const mid = Math.floor(total / 2)
    const { data: mrow } = (await base('price_body_yen').order('price_body_yen', { ascending: true }).range(mid, mid)) as unknown as { data: { price_body_yen: number | null }[] | null }
    const mp = mrow?.[0]?.price_body_yen
    if (mp != null) medianMan = yen2man(mp)
  }

  // 「安い方に5番手まで」＝想定価格のすぐ下（安い方）の競合5件。price<target を高い順に最大5件。
  const { data: cheapRows } = (await base('price_body_yen, model_year, mileage_km, dealer_name, region_prefecture, listing_url')
    .lt('price_body_yen', targetYen)
    .order('price_body_yen', { ascending: false })
    .range(0, 4)) as unknown as {
    data: { price_body_yen: number | null; model_year: number | null; mileage_km: number | null; dealer_name: string | null; region_prefecture: string | null; listing_url: string | null }[] | null
  }
  const cheaper: DpCompetitor[] = (cheapRows ?? []).map((r) => ({
    priceMan: yen2man(r.price_body_yen as number),
    year: r.model_year,
    mileageKm: r.mileage_km,
    dealer: r.dealer_name,
    region: r.region_prefecture,
    url: r.listing_url,
  }))

  return { carLabel, targetMan: yen2man(targetYen), rank, total, medianMan, cheaper }
}

/** ダイレクトプライシングを設定（想定価格の保存＋設定中フラグ）。 */
export async function setDirectPricing(dealId: string, targetYen: number): Promise<void> {
  const sb = createServiceRoleClient()
  const { error } = await sb
    .from('vehicle_deals')
    .update({ direct_pricing_at: new Date().toISOString(), direct_pricing_target_yen: targetYen } as never)
    .eq('id', dealId)
  if (error) throw new Error(error.message)
}

/** ダイレクトプライシングを解除。 */
export async function clearDirectPricing(dealId: string): Promise<void> {
  const sb = createServiceRoleClient()
  const { error } = await sb
    .from('vehicle_deals')
    .update({ direct_pricing_at: null } as never)
    .eq('id', dealId)
  if (error) throw new Error(error.message)
}

/** deal の所有者確認（memberId 一致）。 */
export async function assertDealOwner(dealId: string, memberId: string): Promise<{ maker: string | null; car_model: string | null; year: string | null }> {
  const sb = createServiceRoleClient()
  const { data } = await sb
    .from('vehicle_deals')
    .select('member_id, maker, car_model, year')
    .eq('id', dealId)
    .maybeSingle<{ member_id: string; maker: string | null; car_model: string | null; year: string | null }>()
  if (!data || data.member_id !== memberId) throw new Error('対象の車両が見つかりません。')
  return { maker: data.maker, car_model: data.car_model, year: data.year }
}
