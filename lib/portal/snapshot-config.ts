// 市場スナップショット 収集設定（本部・P2）— 共有 public テーブル cs_market_search_templates の管理。
//
// このテーブルは VPS スクレイパの「巡回対象」を決める共有設定。分析サイトの定期取得も同表を参照する。
// VPS cron が 15分ごとに定期取得を叩き、scheduled_enabled=ON かつ 時刻ウィンドウ内 かつ 前回から3日以上
// 経過したテンプレを run 化して実行する（app/api/cron/market-intelligence-scheduled 相当）。
// → 本部がここで対象県×メーカーのテンプレを増やす/有効化する＝収集カバレッジの拡大（フラッシュアップ）。
//
// ※分析サイトの「コード」は変更しない。共有の「データ設定」だけを編集する。

import { createPublicReadClient, createPublicWriteClient } from '@/lib/supabase/admin'
import { PREFECTURES } from '@/lib/portal/market-snapshot'

const TABLE = 'cs_market_search_templates'

// カーセンサーの正準メーカーコード（name→code）。scraper の url_builder.MAKER_CODES と一致させる。
export const MAKERS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'LE', name: 'レクサス' },
  { code: 'TO', name: 'トヨタ' },
  { code: 'NI', name: '日産' },
  { code: 'HO', name: 'ホンダ' },
  { code: 'MA', name: 'マツダ' },
  { code: 'SB', name: 'スバル' },
  { code: 'SZ', name: 'スズキ' },
  { code: 'MI', name: '三菱' },
  { code: 'DA', name: 'ダイハツ' },
  { code: 'IS', name: 'いすゞ' },
  { code: 'ME', name: 'メルセデス・ベンツ' },
  { code: 'AM', name: 'メルセデスAMG' },
  { code: 'BM', name: 'BMW' },
  { code: 'AD', name: 'アウディ' },
  { code: 'VW', name: 'フォルクスワーゲン' },
  { code: 'PO', name: 'ポルシェ' },
  { code: 'MN', name: 'ミニ' },
  { code: 'VO', name: 'ボルボ' },
  { code: 'JA', name: 'ジャガー' },
  { code: 'LR', name: 'ランドローバー' },
  { code: 'FE', name: 'フェラーリ' },
  { code: 'LG', name: 'ランボルギーニ' },
  { code: 'MS', name: 'マセラティ' },
  { code: 'AF', name: 'アルファ ロメオ' },
  { code: 'FI', name: 'フィアット' },
  { code: 'PE', name: 'プジョー' },
  { code: 'RE', name: 'ルノー' },
  { code: 'CI', name: 'シトロエン' },
  { code: 'JE', name: 'ジープ' },
  { code: 'FO', name: 'フォード' },
  { code: 'CH', name: 'シボレー' },
  { code: 'CA', name: 'キャデラック' },
  { code: 'TS', name: 'テスラ' },
  { code: 'BY', name: 'BYD' },
]

export const MAKER_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  MAKERS.map((m) => [m.code, m.name]),
)

// 地域プリセット（フォームの都道府県一括選択用）。scraper の REGION groups と一致。
export const REGION_PRESETS: ReadonlyArray<{ key: string; label: string; prefectures: string[] }> = [
  { key: 'hokkaido', label: '北海道', prefectures: ['北海道'] },
  { key: 'tohoku', label: '東北', prefectures: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { key: 'kanto', label: '関東', prefectures: ['東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '群馬県', '栃木県'] },
  { key: 'koshinetsu', label: '甲信越', prefectures: ['新潟県', '山梨県', '長野県'] },
  { key: 'hokuriku', label: '北陸', prefectures: ['富山県', '石川県', '福井県'] },
  { key: 'tokai', label: '東海', prefectures: ['愛知県', '岐阜県', '三重県', '静岡県'] },
  { key: 'kansai', label: '関西', prefectures: ['大阪府', '兵庫県', '京都府', '滋賀県', '奈良県', '和歌山県'] },
  { key: 'chugoku', label: '中国', prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
  { key: 'shikoku', label: '四国', prefectures: ['徳島県', '香川県', '愛媛県', '高知県'] },
  { key: 'kyushu', label: '九州・沖縄', prefectures: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
]

export type SnapshotTemplate = {
  id: string
  name: string
  description: string | null
  makerCodes: string[]
  prefectures: string[]
  scheduledEnabled: boolean
  scheduledTimeJst: string | null
  scheduledLastRunAt: string | null
  category: string | null
}

export type TemplateInput = {
  name: string
  description?: string | null
  makerCodes: string[]
  prefectures: string[]
  scheduledEnabled: boolean
  scheduledTimeJst: string | null
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 全テンプレを取得（作成順）。 */
export async function listTemplates(): Promise<SnapshotTemplate[]> {
  const client = createPublicReadClient()
  const { data, error } = await client
    .from(TABLE)
    .select('id, name, description, criteria, scheduled_enabled, scheduled_time_jst, scheduled_last_run_at, category')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`テンプレ取得に失敗しました: ${error.message}`)

  return (data ?? []).map((r) => {
    const c = (r.criteria ?? {}) as Record<string, unknown>
    return {
      id: r.id as string,
      name: (r.name as string) ?? '',
      description: (r.description as string | null) ?? null,
      makerCodes: toStringArray(c.maker_codes),
      prefectures: toStringArray(c.prefectures),
      scheduledEnabled: Boolean(r.scheduled_enabled),
      scheduledTimeJst: (r.scheduled_time_jst as string | null) ?? null,
      scheduledLastRunAt: (r.scheduled_last_run_at as string | null) ?? null,
      category: (r.category as string | null) ?? null,
    }
  })
}

// 入力の正当性チェック（不正なコード/県名で共有テーブルを汚さない）。
const PREF_SET = new Set<string>(PREFECTURES)
const MAKER_SET = new Set(MAKERS.map((m) => m.code))

function validate(input: TemplateInput): { makerCodes: string[]; prefectures: string[]; name: string; time: string | null } {
  const name = input.name.trim()
  if (!name) throw new Error('テンプレ名を入力してください。')
  const makerCodes = [...new Set(input.makerCodes)].filter((c) => MAKER_SET.has(c))
  const prefectures = [...new Set(input.prefectures)].filter((p) => PREF_SET.has(p))
  if (makerCodes.length === 0) throw new Error('メーカーを1つ以上選択してください。')
  if (prefectures.length === 0) throw new Error('都道府県を1つ以上選択してください。')
  let time: string | null = null
  if (input.scheduledTimeJst) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(input.scheduledTimeJst.trim())
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('取得時刻は HH:MM 形式で入力してください。')
    time = `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
  }
  // 有効化するなら取得時刻は必須（時刻が無いと定期取得の対象にならない）
  if (input.scheduledEnabled && !time) throw new Error('定期取得を有効にする場合は取得時刻（HH:MM）が必要です。')
  return { makerCodes, prefectures, name, time }
}

export async function createTemplate(input: TemplateInput): Promise<void> {
  const v = validate(input)
  const client = createPublicWriteClient()
  const { error } = await client.from(TABLE).insert({
    name: v.name,
    description: input.description?.trim() || null,
    criteria: { maker_codes: v.makerCodes, prefectures: v.prefectures },
    is_active: true,
    scope: 'area',
    category: 'A',
    scheduled_enabled: input.scheduledEnabled,
    scheduled_time_jst: v.time,
  })
  if (error) throw new Error(`テンプレ作成に失敗しました: ${error.message}`)
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<void> {
  const v = validate(input)
  const client = createPublicWriteClient()
  const { error } = await client
    .from(TABLE)
    .update({
      name: v.name,
      description: input.description?.trim() || null,
      criteria: { maker_codes: v.makerCodes, prefectures: v.prefectures },
      scheduled_enabled: input.scheduledEnabled,
      scheduled_time_jst: v.time,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`テンプレ更新に失敗しました: ${error.message}`)
}

/** 有効/無効の切り替え（有効化には取得時刻が必要）。 */
export async function setTemplateEnabled(id: string, enabled: boolean): Promise<void> {
  const client = createPublicWriteClient()
  if (enabled) {
    const read = createPublicReadClient()
    const { data } = await read.from(TABLE).select('scheduled_time_jst').eq('id', id).limit(1)
    if (!data?.[0]?.scheduled_time_jst) {
      throw new Error('取得時刻（HH:MM）が未設定のため有効化できません。先に編集で時刻を設定してください。')
    }
  }
  const { error } = await client
    .from(TABLE)
    .update({ scheduled_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`状態の更新に失敗しました: ${error.message}`)
}

export async function deleteTemplate(id: string): Promise<void> {
  const client = createPublicWriteClient()
  const { error } = await client.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(`テンプレ削除に失敗しました: ${error.message}`)
}

/**
 * ⑦ 失敗runの対象テンプレを「再取得予約」する。
 * ポータルからVPSを直接起動できないため、該当テンプレの3日クールダウン（scheduled_last_run_at）を
 * 解除し、次の取得時刻の巡回で自動的に再収集させる。有効化されているテンプレのみ再実行される。
 */
export async function requeueTemplate(templateId: string): Promise<{ scheduledTimeJst: string | null; enabled: boolean }> {
  const read = createPublicReadClient()
  const { data } = await read
    .from(TABLE)
    .select('scheduled_time_jst, scheduled_enabled')
    .eq('id', templateId)
    .maybeSingle<{ scheduled_time_jst: string | null; scheduled_enabled: boolean }>()
  if (!data) throw new Error('対象のテンプレが見つかりません（削除された可能性があります）。')

  const client = createPublicWriteClient()
  const { error } = await client
    .from(TABLE)
    .update({ scheduled_last_run_at: null, updated_at: new Date().toISOString() } as never)
    .eq('id', templateId)
  if (error) throw new Error(`再取得の予約に失敗しました: ${error.message}`)
  return { scheduledTimeJst: data.scheduled_time_jst, enabled: Boolean(data.scheduled_enabled) }
}
