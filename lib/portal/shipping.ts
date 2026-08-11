import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { ShippingRateRow, SpecialVehicleMakerRow } from '@/types/database'
import { PREFECTURES, isPrefecture } from '@/lib/portal/prefectures'
import { getSetting } from '@/lib/portal/settings'

/**
 * 陸送費マスタ＋特殊車個別見積（半自動売買フェーズ5）。
 * 料金は (発地県, 着地県) ペアで設定。特殊車メーカーは「個別見積」に切替。
 */

// #50 発地（拠点）を本部設定で変更可能に。system_settings に value_text が無いため PREFECTURES のindexを value_int に保存。
const SHIPPING_FROM_KEY = 'shipping_from_pref_idx'
const SHIPPING_FROM_FALLBACK = '東京都'

/** 陸送の発地（拠点）を取得。未設定なら既定（東京都）。料金設定・自動計算の発地に使う。 */
export async function getShippingFromPref(): Promise<string> {
  const idx = await getSetting(SHIPPING_FROM_KEY, -1)
  return idx >= 0 && idx < PREFECTURES.length ? PREFECTURES[idx] : SHIPPING_FROM_FALLBACK
}

/** 陸送の発地（拠点）を設定（本部）。料金マスタの発地と揃える。 */
export async function setShippingFromPref(pref: string): Promise<void> {
  if (!isPrefecture(pref)) throw new Error('都道府県を選択してください。')
  const idx = PREFECTURES.indexOf(pref)
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key: SHIPPING_FROM_KEY, value_int: idx, note: `陸送の発地：${pref}` } as never, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

// #52 加盟店の「陸送先（着地）」の初期値（デフォルト）。案件生成時と画面の初期選択に使う。null=デフォルトなし。
const SHIPPING_DEFAULT_TO_KEY = 'shipping_default_to_pref_idx'

/** 加盟店のデフォルト陸送先（着地県）を取得。未設定なら null。 */
export async function getShippingDefaultToPref(): Promise<string | null> {
  const idx = await getSetting(SHIPPING_DEFAULT_TO_KEY, -1)
  return idx >= 0 && idx < PREFECTURES.length ? PREFECTURES[idx] : null
}

/** 加盟店のデフォルト陸送先を設定（本部）。null／空でデフォルトなしに戻す。 */
export async function setShippingDefaultToPref(pref: string | null): Promise<void> {
  const idx = pref && isPrefecture(pref) ? PREFECTURES.indexOf(pref) : -1
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key: SHIPPING_DEFAULT_TO_KEY, value_int: idx, note: idx >= 0 ? `加盟店のデフォルト陸送先：${pref}` : '加盟店のデフォルト陸送先：なし' } as never, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/** 全料金設定を取得（発地→着地順）。 */
export async function listShippingRates(): Promise<ShippingRateRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('shipping_rates')
    .select('*')
    .order('from_pref', { ascending: true })
    .order('to_pref', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ShippingRateRow[]
}

/** (発地, 着地) の料金を設定（upsert）。 */
export async function setShippingRate(fromPref: string, toPref: string, amount: number): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('shipping_rates')
    .upsert({ from_pref: fromPref, to_pref: toPref, amount_yen: Math.round(amount) } as never, { onConflict: 'from_pref,to_pref' })
  if (error) throw new Error(error.message)
}

/** 料金設定を削除。 */
export async function deleteShippingRate(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('shipping_rates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** 特殊車メーカー一覧。 */
export async function listSpecialMakers(): Promise<SpecialVehicleMakerRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('special_vehicle_makers').select('*').order('maker', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SpecialVehicleMakerRow[]
}

/** 特殊車メーカーを追加。 */
export async function addSpecialMaker(maker: string, note?: string | null): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('special_vehicle_makers').insert({ maker, note: note ?? null } as never)
  if (error) throw new Error(error.message)
}

/** 特殊車メーカーを削除。 */
export async function deleteSpecialMaker(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('special_vehicle_makers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** メーカーが個別見積対象か（maker 文字列一致・部分一致）。 */
export async function isSpecialVehicle(maker: string | null | undefined): Promise<boolean> {
  if (!maker) return false
  const makers = await listSpecialMakers()
  const m = maker.trim()
  return makers.some((s) => m.includes(s.maker) || s.maker.includes(m))
}

export type ShippingQuote =
  | { type: 'auto'; amountYen: number; fromPref: string; toPref: string }
  | { type: 'special'; reason: string }   // 特殊車 → 個別見積
  | { type: 'unset'; reason: string }      // 料金未設定 → 個別見積扱い

/**
 * 陸送費の自動計算。
 *   - 特殊車（対象メーカー） → 個別見積（type: 'special'）
 *   - (発地, 着地) の料金設定あり → 自動（type: 'auto'）
 *   - 料金未設定 → 個別見積扱い（type: 'unset'）
 */
export async function quoteShipping(input: { maker: string | null; fromPref: string; toPref: string }): Promise<ShippingQuote> {
  if (await isSpecialVehicle(input.maker)) {
    return { type: 'special', reason: '高級車・規格外車のため個別見積もりが必要です' }
  }
  if (!input.fromPref || !input.toPref) {
    return { type: 'unset', reason: '発地・着地が未設定です' }
  }
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('shipping_rates')
    .select('amount_yen')
    .eq('from_pref', input.fromPref)
    .eq('to_pref', input.toPref)
    .maybeSingle<{ amount_yen: number }>()
  if (!data) {
    return { type: 'unset', reason: 'この区間の料金が未設定のため個別見積もりが必要です' }
  }
  return { type: 'auto', amountYen: data.amount_yen, fromPref: input.fromPref, toPref: input.toPref }
}
