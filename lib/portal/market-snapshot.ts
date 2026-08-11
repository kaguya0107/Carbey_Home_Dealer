// 市場スナップショット（本部・監視 P1）— 共有 public スキーマの読み取り専用。
//
// 実取得は常時稼働の VPS スクレイパ（Python cs_market_intel）が担い、
//   cs_market_snapshot_runs / recent_market_observations / cs_market_prefecture_counts
// を書く。本部ポータルは Vercel 上でこれらを「読むだけ」で稼働状況・鮮度・カバレッジを可視化する。
// （アプリ内 scheduled_fetch_* は実取得に無関係なので使わない。実 run と鮮度で判断する。）

import { createPublicReadClient } from '@/lib/supabase/admin'

export type SnapshotRun = {
  id: string
  startedAt: string | null
  completedAt: string | null
  status: string
  triggerType: string | null
  makerCodes: string[]
  prefectures: string[]
  pagesFetched: number | null
  rowsIngested: number | null
}

export type SnapshotStatus = {
  /** 直近で成功した run の完了時刻 */
  lastSuccessAt: string | null
  /** 最新観測の取得時刻（＝データの鮮度） */
  lastObservationAt: string | null
  /** 30日ローリングで保持している観測件数 */
  totalObservations: number
  /** 直近24時間の取込件数（成功 run 合計） */
  ingested24h: number
  /** 直近7日の run 成功率（0-100, run が無ければ null） */
  successRate7d: number | null
  /** 直近7日の run 総数 */
  runs7d: number
}

export type DailyIngest = { date: string; rows: number; runs: number }

export type PrefectureCoverage = {
  prefecture: string
  /** recent_market_observations に実在する当県の観測件数（未収集=0） */
  listingCount: number
  /** 直近30日で当県を対象にした成功 run の最新完了時刻（＝実スクレイプ鮮度） */
  lastScrapeAt: string | null
  /** 直近30日で当県を対象にした成功 run 数 */
  runs30d: number
  /** 最終スクレイプからの経過時間（時間単位・null=期間内に未収集） */
  ageHours: number | null
  /** 直近30日で1回でも収集対象になったか */
  covered: boolean
}

const HOUR_MS = 3_600_000

// 47都道府県（正準リスト・北→南）。カバレッジの「網羅性」を全県基準で示すため固定で持つ。
export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 収集状況サマリ（サマリカード用） */
export async function getSnapshotStatus(): Promise<SnapshotStatus> {
  const client = createPublicReadClient()
  const now = Date.now()
  const since24h = new Date(now - 24 * HOUR_MS).toISOString()
  const since7d = new Date(now - 7 * 24 * HOUR_MS).toISOString()

  const [lastSuccess, lastObs, totalObs, recent24h, recent7d] = await Promise.all([
    client
      .from('cs_market_snapshot_runs')
      .select('completed_at')
      .eq('status', 'success')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1),
    client
      .from('recent_market_observations')
      .select('fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1),
    client.from('recent_market_observations').select('*', { count: 'exact', head: true }),
    client
      .from('cs_market_snapshot_runs')
      .select('rows_ingested')
      .eq('status', 'success')
      .gte('completed_at', since24h),
    client.from('cs_market_snapshot_runs').select('status').gte('created_at', since7d),
  ])

  const ingested24h = (recent24h.data ?? []).reduce((s, r) => s + (r.rows_ingested ?? 0), 0)
  const runs7d = recent7d.data ?? []
  const ok7d = runs7d.filter((r) => r.status === 'success').length
  const successRate7d = runs7d.length ? Math.round((ok7d / runs7d.length) * 100) : null

  return {
    lastSuccessAt: lastSuccess.data?.[0]?.completed_at ?? null,
    lastObservationAt: lastObs.data?.[0]?.fetched_at ?? null,
    totalObservations: totalObs.count ?? 0,
    ingested24h,
    successRate7d,
    runs7d: runs7d.length,
  }
}

/** 直近の実行履歴 */
export async function getRecentRuns(limit = 20): Promise<SnapshotRun[]> {
  const client = createPublicReadClient()
  const { data } = await client
    .from('cs_market_snapshot_runs')
    .select('id, started_at, completed_at, status, trigger_type, criteria, pages_fetched, rows_ingested')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((r) => {
    const criteria = (r.criteria ?? {}) as Record<string, unknown>
    return {
      id: r.id as string,
      startedAt: r.started_at as string | null,
      completedAt: r.completed_at as string | null,
      status: r.status as string,
      triggerType: r.trigger_type as string | null,
      makerCodes: toStringArray(criteria.maker_codes),
      prefectures: toStringArray(criteria.prefectures),
      pagesFetched: r.pages_fetched as number | null,
      rowsIngested: r.rows_ingested as number | null,
    }
  })
}

/** 日別取込件数（直近 days 日・Asia/Tokyo 日付でまとめる） */
export async function getDailyIngest(days = 14): Promise<DailyIngest[]> {
  const client = createPublicReadClient()
  const since = new Date(Date.now() - days * 24 * HOUR_MS).toISOString()
  const { data } = await client
    .from('cs_market_snapshot_runs')
    .select('completed_at, rows_ingested, status')
    .eq('status', 'success')
    .gte('completed_at', since)
    .not('completed_at', 'is', null)

  const byDay = new Map<string, { rows: number; runs: number }>()
  for (const r of data ?? []) {
    const day = jstDate(r.completed_at as string)
    const cur = byDay.get(day) ?? { rows: 0, runs: 0 }
    cur.rows += (r.rows_ingested as number | null) ?? 0
    cur.runs += 1
    byDay.set(day, cur)
  }

  // 欠損日も 0 で埋めて連続表示にする
  const out: DailyIngest[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = jstDate(new Date(Date.now() - i * 24 * HOUR_MS).toISOString())
    const v = byDay.get(day) ?? { rows: 0, runs: 0 }
    out.push({ date: day, rows: v.rows, runs: v.runs })
  }
  return out
}

/**
 * 都道府県別カバレッジ（＝実収集の網羅性と鮮度）。全47県を返す。
 * 鮮度は「直近30日で当県を対象にした成功 run」から算出（実スクレイプに連動）。
 * 件数は recent_market_observations の実在件数（未収集県=0）。
 * ※ cs_market_prefecture_counts は area 調査フェーズでしか更新されず古くなるため使わない。
 */
export async function getPrefectureCoverage(): Promise<PrefectureCoverage[]> {
  const client = createPublicReadClient()
  const now = Date.now()
  const since30d = new Date(now - 30 * 24 * HOUR_MS).toISOString()

  // 1) 直近30日の成功 run の対象県を集計（最終スクレイプ時刻・run数）
  const { data: runs } = await client
    .from('cs_market_snapshot_runs')
    .select('completed_at, criteria')
    .eq('status', 'success')
    .not('completed_at', 'is', null)
    .gte('completed_at', since30d)

  const lastScrape = new Map<string, string>()
  const runCount = new Map<string, number>()
  for (const r of runs ?? []) {
    const prefs = toStringArray((r.criteria as Record<string, unknown> | null)?.prefectures)
    const completedAt = r.completed_at as string
    for (const p of prefs) {
      runCount.set(p, (runCount.get(p) ?? 0) + 1)
      const cur = lastScrape.get(p)
      if (!cur || completedAt > cur) lastScrape.set(p, completedAt)
    }
  }

  // 2) 収集済み県のみ実件数を並列カウント（未収集県は問い合わせない）
  const coveredPrefs = [...runCount.keys()]
  const counts = await Promise.all(
    coveredPrefs.map(async (p) => {
      const { count } = await client
        .from('recent_market_observations')
        .select('*', { count: 'exact', head: true })
        .eq('region_prefecture', p)
      return [p, count ?? 0] as const
    }),
  )
  const countByPref = new Map(counts)

  // 3) 全47県を合成（未収集県は covered=false / 0件）。収集済み→件数降順、未収集→末尾。
  const rows: PrefectureCoverage[] = PREFECTURES.map((prefecture) => {
    const last = lastScrape.get(prefecture) ?? null
    return {
      prefecture,
      listingCount: countByPref.get(prefecture) ?? 0,
      lastScrapeAt: last,
      runs30d: runCount.get(prefecture) ?? 0,
      ageHours: last ? Math.floor((now - new Date(last).getTime()) / HOUR_MS) : null,
      covered: runCount.has(prefecture),
    }
  })
  rows.sort((a, b) => {
    if (a.covered !== b.covered) return a.covered ? -1 : 1
    return b.listingCount - a.listingCount
  })
  return rows
}

/** メーカーコード → 表示名（cs_market_area_makers から。SZ→スズキ 等） */
export async function getMakerNames(): Promise<Record<string, string>> {
  const client = createPublicReadClient()
  const { data } = await client.from('cs_market_area_makers').select('maker_code, maker_name')
  const map: Record<string, string> = {}
  for (const r of data ?? []) {
    const code = r.maker_code as string | null
    const name = r.maker_name as string | null
    if (code && name && !map[code]) map[code] = name
  }
  return map
}

/** ISO文字列 → Asia/Tokyo の YYYY-MM-DD */
function jstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * HOUR_MS)
  return d.toISOString().slice(0, 10)
}
