/**
 * Claude が tool_use を返した時の実行ハンドラ。
 *
 * 設計:
 *   - AI への戻り値 (`result`) と、UI 表示用の根拠データ (`evidence`) を分離。
 *   - AI には集約済み・少量のデータだけを返す (コスト削減)。
 *   - 根拠データは UI のメッセージフッターで「分析対象: ○件・○○県・○○時点」として表示。
 */
import { createPublicReadClient } from '@/lib/supabase/admin'
import {
  fetchPriceDistribution,
  fetchSoldRecent,
  fetchSoldBreakdown,
  fetchTurnover,
} from '@/lib/analytics/marketAnalyticsQueries'
import {
  fetchPriceTrend,
  fetchInventoryTrend,
  fetchRegionalTrend,
  fetchRisingModels,
} from '@/lib/analytics/marketTrendQueries'
import { getActiveAgreement, listAttachments } from '@/lib/portal/agreements'
import type { ToolName } from './tools'

export type Evidence = {
  function: ToolName
  args: Record<string, unknown>
  /** 集計に使った行数 (UIで「○件分析」と表示) */
  result_count: number
  /** 分析時点 (UIで表示)。トレンド系では最新データ点の日付。 */
  snapshot_date: string
  /** トレンド系の根拠: 参照した期間レンジ [開始日, 終了日] とデータ点数 */
  date_range?: { from: string; to: string; points: number }
  /** 補足: 検索条件のサマリ */
  summary?: string
}

export type ToolExecutionResult = {
  /** AI に渡す JSON 化可能なデータ */
  result: unknown
  /** UI 表示用の根拠 */
  evidence: Evidence
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * region 引数の正規化（空振り防止）。
 * データは region_prefecture（都道府県名）でキーされているため、都道府県名のみを絞り込みに使う。
 * 「全国」「全体」「関東」などの非都道府県値は undefined（＝絞り込みなし＝全国）に落とす。
 */
function normalizeRegion(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s) return undefined
  return /(都|道|府|県)$/.test(s) ? s : undefined
}

/**
 * car_name の正規化（空振り防止）。
 * 「市場全体」「中古車」などの“車種でない語”を car_name に渡された場合は空（＝車種絞り込みなし＝全体）にする。
 * 実在の車種名は決してこれらに一致しないため安全。
 */
const CAR_NAME_SENTINELS = new Set([
  '', '全体', '市場全体', '市場', '全国', '全車種', '全車', 'すべて', '全て', '中古車', '中古車全体', '車両', 'クルマ', '車',
])
function normalizeCarName(v: unknown): string {
  let s = String(v ?? '').trim()
  if (CAR_NAME_SENTINELS.has(s)) return ''
  // モデルが車種名に付けがちな末尾の非車種語を除去（「プリウスの中古相場」→「プリウス」）。
  // 「30後期」「20系」などの年式・世代は残す（実在の絞り込み語のため）。
  s = s.replace(/(の|中古車|中古|相場|価格|市場|在庫|情報|目安|について)+$/u, '').trim()
  return CAR_NAME_SENTINELS.has(s) ? '' : s
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const client = createPublicReadClient()
  const today = todayISO()

  switch (name as ToolName) {
    case 'get_popularity': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const year_min = input.year_min != null ? Number(input.year_min) : undefined
      const year_max = input.year_max != null ? Number(input.year_max) : undefined
      const price_min_yen =
        input.price_min_yen != null ? Number(input.price_min_yen) : undefined
      const price_max_yen =
        input.price_max_yen != null ? Number(input.price_max_yen) : undefined
      const mileage_max_km =
        input.mileage_max_km != null ? Number(input.mileage_max_km) : undefined

      const hasFilter =
        year_min != null ||
        year_max != null ||
        price_min_yen != null ||
        price_max_yen != null ||
        mileage_max_km != null

      // 30日ローリング（重複除去済み）の実データから色分布を集計。
      // 旧実装は絞込時に最新1runのみ参照していて偏るため、他ツールと同じ recent_market_observations に統一。
      // 正確な総数は head count、色の割合はサンプルから算出（色横断でマージ＝重複表示を解消）。
      let countQuery = client
        .from('recent_market_observations')
        .select('*', { count: 'exact', head: true })
        .not('color', 'is', null)
      if (car_name) countQuery = countQuery.ilike('car_name', `%${car_name}%`)
      if (region) countQuery = countQuery.eq('region_prefecture', region)
      if (year_min != null) countQuery = countQuery.gte('model_year', year_min)
      if (year_max != null) countQuery = countQuery.lte('model_year', year_max)
      if (price_min_yen != null) countQuery = countQuery.gte('price_body_yen', price_min_yen)
      if (price_max_yen != null) countQuery = countQuery.lte('price_body_yen', price_max_yen)
      if (mileage_max_km != null) countQuery = countQuery.lte('mileage_km', mileage_max_km)
      const { count: popCount } = await countQuery

      let colorQuery = client
        .from('recent_market_observations')
        .select('color')
        .not('color', 'is', null)
      if (car_name) colorQuery = colorQuery.ilike('car_name', `%${car_name}%`)
      if (region) colorQuery = colorQuery.eq('region_prefecture', region)
      if (year_min != null) colorQuery = colorQuery.gte('model_year', year_min)
      if (year_max != null) colorQuery = colorQuery.lte('model_year', year_max)
      if (price_min_yen != null) colorQuery = colorQuery.gte('price_body_yen', price_min_yen)
      if (price_max_yen != null) colorQuery = colorQuery.lte('price_body_yen', price_max_yen)
      if (mileage_max_km != null) colorQuery = colorQuery.lte('mileage_km', mileage_max_km)
      const { data: colorRows } = await colorQuery.limit(10000)

      const sample = (colorRows ?? []) as Array<{ color: string | null }>
      const sampleSize = sample.length
      const byColor = new Map<string, number>()
      for (const r of sample) {
        if (r.color) byColor.set(r.color, (byColor.get(r.color) ?? 0) + 1)
      }
      const totalCount = popCount ?? sampleSize
      const top = [...byColor.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([color, count]) => ({
          color,
          count,
          pct: sampleSize > 0 ? Math.round((count / sampleSize) * 1000) / 10 : 0,
        }))

      return {
        result: { car_name, region: region ?? '全国', total: totalCount, top_colors: top },
        evidence: {
          function: 'get_popularity',
          args: { car_name, region, year_min, year_max, price_min_yen, price_max_yen, mileage_max_km },
          result_count: totalCount,
          snapshot_date: today,
          summary: `${region ?? '全国'}/${car_name} ${totalCount.toLocaleString()}件${hasFilter ? ' (絞込)' : ''}`,
        },
      }
    }

    case 'get_turnover_days': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const rows = await fetchTurnover(client, { car_name, region })
      const totalSold = rows.reduce((s, r) => s + r.sold_count, 0)
      const weightedAvg =
        totalSold > 0
          ? Math.round(
              rows.reduce((s, r) => s + r.avg_days * r.sold_count, 0) / totalSold,
            )
          : null
      return {
        result: {
          car_name,
          region: region ?? '全国',
          sold_count: totalSold,
          avg_days: weightedAvg,
          by_region: rows.slice(0, 10).map((r) => ({
            region: r.region_prefecture,
            sold_count: r.sold_count,
            avg_days: r.avg_days,
            median_days: r.median_days,
          })),
        },
        evidence: {
          function: 'get_turnover_days',
          args: { car_name, region },
          result_count: totalSold,
          snapshot_date: today,
          summary: `${region ?? '全国'}/${car_name} 売却推定${totalSold.toLocaleString()}件`,
        },
      }
    }

    case 'get_price_distribution': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const year_min = input.year_min != null ? Number(input.year_min) : undefined
      const year_max = input.year_max != null ? Number(input.year_max) : undefined
      const hasFilter = year_min != null || year_max != null

      // 30日ローリングの実データから価格分布を集計（絞込も同経路。バケットは価格帯でマージ＝重複表示を解消）。
      let countQuery = client
        .from('recent_market_observations')
        .select('*', { count: 'exact', head: true })
        .not('price_body_yen', 'is', null)
      if (car_name) countQuery = countQuery.ilike('car_name', `%${car_name}%`)
      if (region) countQuery = countQuery.eq('region_prefecture', region)
      if (year_min != null) countQuery = countQuery.gte('model_year', year_min)
      if (year_max != null) countQuery = countQuery.lte('model_year', year_max)
      const { count: pdCount } = await countQuery

      let priceQuery = client
        .from('recent_market_observations')
        .select('price_body_yen')
        .not('price_body_yen', 'is', null)
      if (car_name) priceQuery = priceQuery.ilike('car_name', `%${car_name}%`)
      if (region) priceQuery = priceQuery.eq('region_prefecture', region)
      if (year_min != null) priceQuery = priceQuery.gte('model_year', year_min)
      if (year_max != null) priceQuery = priceQuery.lte('model_year', year_max)
      const { data: priceRows } = await priceQuery.limit(10000)

      const prices = (priceRows ?? [])
        .map((r) => (r as { price_body_yen: number | null }).price_body_yen)
        .filter((p): p is number => p != null && p > 0)
        .sort((a, b) => a - b)
      const total = pdCount ?? prices.length
      const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null

      const bucketMap = new Map<number, number[]>() // 10万円刻み bucket -> prices[]
      for (const p of prices) {
        const b = Math.floor(p / 100000)
        if (!bucketMap.has(b)) bucketMap.set(b, [])
        bucketMap.get(b)!.push(p)
      }
      const buckets = [...bucketMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(0, 20)
        .map(([b, ps]) => ({
          bucket_label: `${b * 10}万円台`,
          count: ps.length,
          avg_price: Math.round(ps.reduce((s, x) => s + x, 0) / ps.length),
          median_price: ps[Math.floor(ps.length / 2)] ?? 0,
        }))

      return {
        result: {
          car_name,
          region: region ?? '全国',
          total,
          median_price: medianPrice,
          buckets,
        },
        evidence: {
          function: 'get_price_distribution',
          args: { car_name, region, year_min, year_max },
          result_count: total,
          snapshot_date: today,
          summary: `${region ?? '全国'}/${car_name} 価格分布 ${total.toLocaleString()}件${hasFilter ? ' (絞込)' : ''}`,
        },
      }
    }

    case 'compare_regions': {
      const car_name = normalizeCarName(input.car_name)
      const regions = Array.isArray(input.regions)
        ? input.regions.map(String).slice(0, 5)
        : []
      const summaries: Array<{
        region: string
        total: number
        median_price: number | null
        top_color: string | null
      }> = []
      let grandTotal = 0
      // 各地域を 30日ローリングの実データで集計（他ツールと同一ソースに統一）。
      // 件数=head count、中央価格・人気色=サンプル（最大10000件）から算出。
      for (const region of regions) {
        let cQ = client
          .from('recent_market_observations')
          .select('*', { count: 'exact', head: true })
          .not('price_body_yen', 'is', null)
          .eq('region_prefecture', region)
        if (car_name) cQ = cQ.ilike('car_name', `%${car_name}%`)
        const { count: t } = await cQ
        const regionTotal = t ?? 0
        grandTotal += regionTotal

        let sQ = client
          .from('recent_market_observations')
          .select('price_body_yen, color')
          .not('price_body_yen', 'is', null)
          .eq('region_prefecture', region)
        if (car_name) sQ = sQ.ilike('car_name', `%${car_name}%`)
        const { data: sRows } = await sQ.limit(10000)
        const rows = (sRows ?? []) as Array<{ price_body_yen: number | null; color: string | null }>

        const prices = rows
          .map((r) => r.price_body_yen)
          .filter((p): p is number => p != null && p > 0)
          .sort((a, b) => a - b)
        const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null

        const byColor = new Map<string, number>()
        for (const r of rows) {
          if (r.color) byColor.set(r.color, (byColor.get(r.color) ?? 0) + 1)
        }
        const topColor = [...byColor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

        summaries.push({ region, total: regionTotal, median_price: medianPrice, top_color: topColor })
      }

      return {
        result: { car_name, comparisons: summaries },
        evidence: {
          function: 'compare_regions',
          args: { car_name, regions },
          result_count: grandTotal,
          snapshot_date: today,
          summary: `${car_name} ${regions.length}地域比較 計${grandTotal.toLocaleString()}件`,
        },
      }
    }

    case 'count_sold_recent': {
      const days = Math.max(1, Math.min(90, Number(input.days ?? 7)))
      const car_name = input.car_name ? String(input.car_name) : undefined
      const region = normalizeRegion(input.region)
      const rows = await fetchSoldRecent(client, {
        days,
        car_name,
        region,
        limit: 1000,
      })
      // 車種別・色別の上位を集計してAIに返す
      const byCar = new Map<string, number>()
      const byColor = new Map<string, number>()
      for (const r of rows) {
        const c = r.car_name ?? '不明'
        byCar.set(c, (byCar.get(c) ?? 0) + 1)
        const col = r.last_color ?? '不明'
        byColor.set(col, (byColor.get(col) ?? 0) + 1)
      }
      const top = (m: Map<string, number>) =>
        [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => ({ name: k, count: v }))
      return {
        result: {
          days,
          filters: { car_name: car_name ?? null, region: region ?? null },
          total: rows.length,
          top_car_names: top(byCar),
          top_colors: top(byColor),
        },
        evidence: {
          function: 'count_sold_recent',
          args: { days, car_name, region },
          result_count: rows.length,
          snapshot_date: today,
          summary: `直近${days}日売却 ${region ?? '全国'}${car_name ? '/' + car_name : ''} ${rows.length.toLocaleString()}件`,
        },
      }
    }

    case 'get_own_inventory': {
      const car_name = input.car_name ? String(input.car_name) : null
      const sort = String(input.sort ?? 'stagnation')
      const stagnation_min = input.stagnation_min_days != null ? Number(input.stagnation_min_days) : null
      const limit = Math.min(100, Math.max(1, Number(input.limit ?? 20)))

      // car_name に「メーカー名＋車種名＋グレード」のような長い文字列が渡されると
      // ILIKE '%全文%' が DB の car_name（例: "シボレーカマロ"）に一致せず 0 件になる。
      // 段階的にゆるい候補へフォールバックして在庫を取りこぼさないようにする。
      // 例: "シボレー シボレーカマロ 絶版旧車…" → ["シボレー シボレーカマロ 絶版旧車…", "シボレー", "シボレーカマロ", "絶版旧車…"]
      const carNameCandidates: (string | null)[] = (() => {
        if (!car_name) return [null]
        const tokens = car_name.split(/[\s　]+/).filter((t) => t.length >= 2)
        // 全文 → 各トークン（長い順＝より具体的なものを先に）→ null（無絞り込み）の順で試す
        const uniq = Array.from(new Set([car_name, ...tokens.sort((a, b) => b.length - a.length)]))
        return [...uniq, null]
      })()

      // 候補を順に試し、最初にヒットした car_name 絞り込みを採用する。
      // （全文一致 → トークン一致 → 無絞り込み）。matchedCarName が実際に効いた条件。
      const runDetail = (cn: string | null) => {
        let q = (client.from as any)('inventory_with_metrics')
          .select('id, maker, car_name, grade, year, mileage_numeric, price_body, price_total, color, stagnation_days, cvr, publication_status')
          .limit(limit)
        if (cn) q = q.ilike('car_name', `%${cn}%`)
        if (stagnation_min != null) q = q.gte('stagnation_days', stagnation_min)
        if (sort === 'newest') q = q.order('inserted_at', { ascending: false, nullsFirst: false })
        else q = q.order('stagnation_days', { ascending: false, nullsFirst: false })
        return q
      }

      let invRows: any[] | null = null
      let matchedCarName: string | null = null
      for (const cand of carNameCandidates) {
        const { data } = await runDetail(cand)
        if (data && data.length > 0) {
          invRows = data
          matchedCarName = cand
          break
        }
      }

      // 在庫全体の滞留サマリ (limit に関係なく全件で集計する)。実際にヒットした絞り込みで集計。
      let aggQuery = (client.from as any)('inventory_with_metrics')
        .select('stagnation_days, publication_status')
      if (matchedCarName) aggQuery = aggQuery.ilike('car_name', `%${matchedCarName}%`)
      if (stagnation_min != null) aggQuery = aggQuery.gte('stagnation_days', stagnation_min)
      const { data: aggRows } = await aggQuery
      const allInv = (aggRows ?? []) as Array<{ stagnation_days: number | null; publication_status: string | null }>
      const fleetSummary = {
        total_inventory: allInv.length,
        urgent_90d_plus: allInv.filter((r) => (r.stagnation_days ?? 0) >= 90).length,
        watch_45_90d: allInv.filter((r) => (r.stagnation_days ?? 0) >= 45 && (r.stagnation_days ?? 0) < 90).length,
        normal_under_45d: allInv.filter((r) => (r.stagnation_days ?? 0) < 45).length,
      }

      if (!invRows || invRows.length === 0) {
        return {
          result: { vehicles: [], total: 0, message: '該当する在庫が見つかりませんでした' },
          evidence: {
            function: 'get_own_inventory',
            args: { car_name, sort, stagnation_min_days: stagnation_min, limit },
            result_count: 0,
            snapshot_date: today,
            summary: car_name ? `自社在庫: ${car_name} → 0件` : '自社在庫: 0件',
          },
        }
      }

      // 直近30日スナップショット群 (stock重複排除済の recent_market_observations view) で
      // 市場中央価格を取得してマッチング。最新1枚固定だと競合の入れ替わりでサンプルが薄くなるため。
      type InvRow = { id: string; maker: string | null; car_name: string | null; grade: string | null; year: number | null; mileage_numeric: number | null; price_body: number | null; price_total: number | null; color: string | null; stagnation_days: number | null; cvr: number | null; publication_status: string | null }
      type ObsRow = { car_name: string | null; model_year: number | null; price_body_yen: number | null }

      // 車名フィルタがあれば絞り込む（全取得を避ける）。
      // 実際に在庫がヒットした matchedCarName を使う（全文だと市場側も 0 件になるため）。
      let obsQuery = (client.from as any)('recent_market_observations')
        .select('car_name, model_year, price_body_yen')
        .not('price_body_yen', 'is', null)
      if (matchedCarName) obsQuery = obsQuery.ilike('car_name', `%${matchedCarName}%`)
      const { data: obs } = await obsQuery.limit(10000)
      const observations = (obs ?? []) as ObsRow[]

      // 各在庫の市場中央値を計算
      const YEAR_TOL = 5
      const vehicles = (invRows as InvRow[]).map((inv) => {
        const matched: number[] = []
        if (inv.car_name && observations.length > 0) {
          const invNameN = inv.car_name.replace(/[\s　]+/g, '').toLowerCase()
          for (const o of observations) {
            const obsNameN = (o.car_name ?? '').replace(/[\s　]+/g, '').toLowerCase()
            if (!invNameN || !obsNameN) continue
            if (!invNameN.includes(obsNameN) && !obsNameN.includes(invNameN)) continue
            if (inv.year != null && o.model_year != null && Math.abs(o.model_year - inv.year) > YEAR_TOL) continue
            if (o.price_body_yen != null && o.price_body_yen > 0) matched.push(o.price_body_yen)
          }
        }
        matched.sort((a, b) => a - b)
        const medianYen = matched.length > 0
          ? matched[Math.floor(matched.length / 2)]
          : null
        const myPrice = inv.price_body ?? inv.price_total
        const gapPct = myPrice != null && medianYen != null && medianYen > 0
          ? Math.round(((myPrice - medianYen) / medianYen) * 1000) / 10
          : null

        return {
          id: inv.id,
          maker: inv.maker,
          car_name: inv.car_name,
          grade: inv.grade,
          year: inv.year,
          mileage_km: inv.mileage_numeric,
          price_man: myPrice != null ? Math.round(myPrice / 10000) : null,
          color: inv.color,
          stagnation_days: inv.stagnation_days,
          cvr: inv.cvr,
          market_median_man: medianYen != null ? Math.round(medianYen / 10000) : null,
          market_sample: matched.length,
          price_gap_pct: gapPct,
          status: inv.publication_status,
        }
      })

      // price_gap ソートは後処理
      if (sort === 'price_gap') {
        vehicles.sort((a, b) => (b.price_gap_pct ?? -999) - (a.price_gap_pct ?? -999))
      }

      const overpricedCount = vehicles.filter((v) => v.price_gap_pct != null && v.price_gap_pct > 10).length

      return {
        result: {
          // 在庫全体の台数サマリ (limit に関係なく全件ベース)。回答ではこの値を使うこと。
          fleet_summary: fleetSummary,
          // 以下 vehicles は詳細表示用に limit 件まで返した「一部」。全体台数は fleet_summary 参照。
          returned_count: vehicles.length,
          is_truncated: vehicles.length < fleetSummary.total_inventory,
          vehicles,
          summary: {
            total: fleetSummary.total_inventory,
            urgent_90d_plus: fleetSummary.urgent_90d_plus,
            watch_45_90d: fleetSummary.watch_45_90d,
            overpriced_10pct_plus_in_sample: overpricedCount,
          },
        },
        evidence: {
          function: 'get_own_inventory',
          args: { car_name, sort, stagnation_min_days: stagnation_min, limit },
          result_count: fleetSummary.total_inventory,
          snapshot_date: today,
          summary: `自社在庫${fleetSummary.total_inventory}台 (要対応${fleetSummary.urgent_90d_plus}台・表示${vehicles.length}台)`,
        },
      }
    }

    case 'get_market_gap': {
      const inventory_id = String(input.inventory_id ?? '')
      // 自社在庫を取得
      const { data: inv } = await client
        .from('inventories')
        .select('id, car_name, maker, price_body, price_total, color, year')
        .eq('id', inventory_id)
        .maybeSingle()
      if (!inv) {
        return {
          result: { error: '指定された在庫が見つかりません', inventory_id },
          evidence: {
            function: 'get_market_gap',
            args: { inventory_id },
            result_count: 0,
            snapshot_date: today,
            summary: `在庫不在: ${inventory_id}`,
          },
        }
      }
      // 同車種の市場価格分布
      const dist = inv.car_name
        ? await fetchPriceDistribution(client, { car_name: inv.car_name })
        : []
      const total = dist.reduce((s, r) => s + r.count, 0)
      let median: number | null = null
      if (total > 0) {
        const sorted = dist.slice().sort((a, b) => a.price_bucket - b.price_bucket)
        let acc = 0
        const half = total / 2
        for (const r of sorted) {
          acc += r.count
          if (acc >= half) {
            median = r.median_price
            break
          }
        }
      }
      const myPrice = inv.price_body ?? inv.price_total ?? null
      const diff = myPrice != null && median != null ? myPrice - median : null
      const diffPct =
        diff != null && median != null && median > 0
          ? Math.round((diff / median) * 1000) / 10
          : null

      // 同型の市場サンプルが薄い（旧車・希少車・カスタム等）場合のグレースフルな補完。
      // 「データが紐付いていない」で終わらせず、同メーカーの蓄積市場データを参考値として返し、
      // AI が多角的に回答できる材料を渡す。
      const SPARSE_THRESHOLD = 5
      let maker_context:
        | { maker: string; sample_size: number; price_min_man: number | null; price_max_man: number | null; median_man: number | null }
        | null = null
      let note: string | null = null
      if (total < SPARSE_THRESHOLD && inv.maker) {
        const { data: makerRows } = await (client.from as any)('recent_market_observations')
          .select('price_total_yen')
          .eq('maker', inv.maker)
          .not('price_total_yen', 'is', null)
          .order('price_total_yen', { ascending: true })
          .limit(2000)
        const prices = ((makerRows ?? []) as { price_total_yen: number | null }[])
          .map((r) => r.price_total_yen)
          .filter((p): p is number => p != null)
        if (prices.length > 0) {
          const toMan = (yen: number) => Math.round(yen / 10000)
          maker_context = {
            maker: inv.maker,
            sample_size: prices.length,
            price_min_man: toMan(prices[0]),
            price_max_man: toMan(prices[prices.length - 1]),
            median_man: toMan(prices[Math.floor(prices.length / 2)]),
          }
        }
        note =
          `同一車種「${inv.car_name ?? '—'}」の市場掲載が${total}件と少ないため、直接の中央値比較は参考値です。` +
          (maker_context
            ? `代わりに同メーカー(${inv.maker})${maker_context.sample_size}件の価格帯（${maker_context.price_min_man}〜${maker_context.price_max_man}万円・中央${maker_context.median_man}万円）を参考に、車両の希少性・状態・カスタム内容を踏まえて多角的に判断してください。`
            : `市場データが乏しいため、一般的な相場観・希少性・状態・需要を踏まえて判断してください。`)
      }

      return {
        result: {
          inventory: {
            id: inv.id,
            maker: inv.maker,
            car_name: inv.car_name,
            year: inv.year,
            color: inv.color,
            my_price: myPrice,
          },
          market: {
            median_price: median,
            sample_size: total,
          },
          gap: {
            diff_yen: diff,
            diff_pct: diffPct,
          },
          // 同型データが薄い場合のみ付与（AI の多角的回答用）
          maker_context,
          note,
        },
        evidence: {
          function: 'get_market_gap',
          args: { inventory_id },
          result_count: total,
          snapshot_date: today,
          summary: `自社${inv.car_name ?? '車両'} vs 市場${total.toLocaleString()}件${maker_context ? `（同メーカー${maker_context.sample_size}件で補完）` : ''}`,
        },
      }
    }

    case 'get_sold_breakdown': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const days = input.days != null ? Math.max(1, Math.min(180, Number(input.days))) : 90
      const year_min = input.year_min != null ? Number(input.year_min) : undefined
      const year_max = input.year_max != null ? Number(input.year_max) : undefined
      const grade = input.grade ? String(input.grade) : undefined
      const color = input.color ? String(input.color) : undefined
      const mileage_max_km = input.mileage_max_km != null ? Number(input.mileage_max_km) : undefined

      const rows = await fetchSoldBreakdown(client, {
        car_name, region, days, year_min, year_max, grade, color, mileage_max_km,
      })
      const total = rows.length

      // グレード別集計
      const byGrade = new Map<string, number>()
      for (const r of rows) {
        const g = r.grade ?? '不明'
        byGrade.set(g, (byGrade.get(g) ?? 0) + 1)
      }
      const gradeBreakdown = [...byGrade.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([g, cnt]) => ({
          grade: g,
          count: cnt,
          pct: Math.round((cnt / Math.max(1, total)) * 1000) / 10,
        }))

      // 色別集計
      const byColor = new Map<string, number>()
      for (const r of rows) {
        const c = r.last_color ?? '不明'
        byColor.set(c, (byColor.get(c) ?? 0) + 1)
      }
      const colorBreakdown = [...byColor.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c, cnt]) => ({
          color: c,
          count: cnt,
          pct: Math.round((cnt / Math.max(1, total)) * 1000) / 10,
        }))

      // 年式別集計
      const byYear = new Map<number, number>()
      for (const r of rows) {
        if (r.model_year == null) continue
        byYear.set(r.model_year, (byYear.get(r.model_year) ?? 0) + 1)
      }
      const yearBreakdown = [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 10)
        .map(([y, cnt]) => ({ year: y, count: cnt }))

      // 価格帯集計 (10万円刻み)
      const byPriceBucket = new Map<number, number>()
      for (const r of rows) {
        const p = r.last_price_body_yen
        if (p == null) continue
        const bucket = Math.floor(p / 100000) * 10 // 万円単位
        byPriceBucket.set(bucket, (byPriceBucket.get(bucket) ?? 0) + 1)
      }
      const priceBreakdown = [...byPriceBucket.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(0, 15)
        .map(([bucket, cnt]) => ({ price_range: `${bucket}〜${bucket + 10}万円`, count: cnt }))

      // 走行距離帯集計 (1万km刻み)
      const byMileage = new Map<number, number>()
      for (const r of rows) {
        const km = r.mileage_km
        if (km == null) continue
        const bucket = Math.floor(km / 10000) * 1 // 1万km刻み
        byMileage.set(bucket, (byMileage.get(bucket) ?? 0) + 1)
      }
      const mileageBreakdown = [...byMileage.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(0, 12)
        .map(([b, cnt]) => ({ mileage_range: `${b}〜${b + 1}万km`, count: cnt }))

      // 平均売却日数
      const daysArr = rows.map(r => r.estimated_days_to_sell).filter((d): d is number => d != null)
      const avgDays = daysArr.length > 0
        ? Math.round(daysArr.reduce((s, d) => s + d, 0) / daysArr.length)
        : null

      const filterDesc = [
        region ?? '全国',
        year_min || year_max ? `${year_min ?? ''}〜${year_max ?? ''}年式` : null,
        grade ? `グレード:${grade}` : null,
        color ? `色:${color}` : null,
        mileage_max_km ? `走行〜${mileage_max_km / 1000}万km` : null,
      ].filter(Boolean).join(' ')

      return {
        result: {
          car_name,
          filters: { region: region ?? null, days, year_min: year_min ?? null, year_max: year_max ?? null, grade: grade ?? null, color: color ?? null, mileage_max_km: mileage_max_km ?? null },
          total,
          avg_days_to_sell: avgDays,
          grade_breakdown: gradeBreakdown,
          color_breakdown: colorBreakdown,
          year_breakdown: yearBreakdown,
          price_breakdown: priceBreakdown,
          mileage_breakdown: mileageBreakdown,
        },
        evidence: {
          function: 'get_sold_breakdown',
          args: { car_name, region, days, year_min, year_max, grade, color, mileage_max_km },
          result_count: total,
          snapshot_date: today,
          summary: `${filterDesc}/${car_name} 売却内訳 ${total.toLocaleString()}件 (直近${days}日)`,
        },
      }
    }

    case 'get_sales_performance': {
      const month = input.month ? String(input.month) : undefined
      const months =
        input.months != null ? Math.max(1, Math.min(24, Number(input.months))) : 6
      const car_name = input.car_name ? String(input.car_name).trim() : undefined
      const carLabel = car_name ? `${car_name} ` : ''

      // 単月指定: その月の販売車両を集計して詳細を返す
      if (month) {
        if (!/^\d{4}-\d{2}$/.test(month)) {
          throw new Error('month は YYYY-MM 形式で指定してください 例: 2026-05')
        }
        const [y, m] = month.split('-').map(Number)
        const lastDay = new Date(y, m, 0).getDate()
        const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`

        let q = client
          .from('inventories')
          .select('vehicle_code, maker, car_name, grade, year, mileage, price_body, cost_price, sold_date')
          .not('sold_date', 'is', null)
          .gte('sold_date', `${month}-01`)
          .lte('sold_date', monthEnd)
          .order('sold_date', { ascending: false })
        if (car_name) q = q.ilike('car_name', `%${car_name}%`)
        const { data, error } = await q

        if (error) throw new Error(`販売実績の取得に失敗: ${error.message}`)

        const rows = (data ?? []) as Array<{
          vehicle_code: string | null
          maker: string | null
          car_name: string | null
          grade: string | null
          year: number | null
          mileage: number | null
          price_body: number | null
          cost_price: number | null
          sold_date: string
        }>

        const totalSales = rows.length
        const totalRevenue = rows.reduce((s, r) => s + (r.price_body ?? 0), 0)
        const avgPrice = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0

        // 粗利は原価(cost_price)が入っている車両だけで算出する。
        // 原価未入力だと「粗利=販売価格全額(=粗利率100%)」という非現実的な値になり
        // 誤解を招くため、原価ありの台数を明示し、AI に注意喚起させる。
        const withCost = rows.filter((r) => r.cost_price != null && r.cost_price > 0)
        const costMissingCount = totalSales - withCost.length
        const profitBase = withCost.reduce((s, r) => s + (r.price_body ?? 0), 0)
        const totalProfit = withCost.reduce(
          (s, r) => s + ((r.price_body ?? 0) - (r.cost_price ?? 0)),
          0,
        )
        const profitRate =
          withCost.length > 0 && profitBase > 0
            ? Math.round((totalProfit / profitBase) * 1000) / 10
            : null

        // 個別車両の明細 (年式・グレード・走行距離・価格)。多すぎるとコスト増なので上限50。
        const vehicles = rows.slice(0, 50).map((r) => ({
          vehicle_code: r.vehicle_code ?? null,
          name: [r.maker, r.car_name].filter(Boolean).join(' ') || '不明',
          grade: r.grade ?? null,
          year: r.year ?? null,
          mileage_km: r.mileage ?? null,
          price_yen: r.price_body ?? null,
          sold_date: r.sold_date,
        }))

        // 売れた車種ランキング (台数上位)
        const byCar = new Map<string, number>()
        for (const r of rows) {
          const key = [r.maker, r.car_name].filter(Boolean).join(' ') || '不明'
          byCar.set(key, (byCar.get(key) ?? 0) + 1)
        }
        const topVehicles = [...byCar.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }))

        return {
          result: {
            month,
            car_name: car_name ?? null,
            total_sales: totalSales,
            total_revenue_yen: totalRevenue,
            avg_price_yen: avgPrice,
            // 粗利は原価ありの台数ベース。原価未入力の台数を併記する。
            profit_based_on_count: withCost.length,
            cost_missing_count: costMissingCount,
            total_profit_yen: withCost.length > 0 ? totalProfit : null,
            profit_rate_pct: profitRate,
            top_vehicles: topVehicles,
            vehicles,
            vehicles_truncated: totalSales > vehicles.length,
          },
          evidence: {
            function: 'get_sales_performance',
            args: { month, car_name },
            result_count: totalSales,
            snapshot_date: today,
            summary: `${carLabel}${month} 販売実績 ${totalSales}台 / 売上${Math.round(totalRevenue / 10000).toLocaleString()}万円`,
          },
        }
      }

      // 月指定なし: 月別推移サマリ
      let trend: Array<{
        month: string
        total_sales: number
        total_revenue_yen: number
        avg_price_yen: number
      }>

      if (car_name) {
        // 車種絞り込みあり: view は全車種集計のため使えない。inventories を直接集計。
        // 直近 months ヶ月の範囲を算出 (当月含む)
        const now = new Date()
        const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
        const startStr = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}-01`

        const { data, error } = await client
          .from('inventories')
          .select('price_body, sold_date')
          .not('sold_date', 'is', null)
          .gte('sold_date', startStr)
          .ilike('car_name', `%${car_name}%`)

        if (error) throw new Error(`月別販売サマリの取得に失敗: ${error.message}`)

        const rows = (data ?? []) as Array<{
          price_body: number | null
          sold_date: string
        }>

        // 月(YYYY-MM)ごとに集計
        const byMonth = new Map<string, { count: number; revenue: number }>()
        for (const r of rows) {
          const mKey = r.sold_date.slice(0, 7)
          const cur = byMonth.get(mKey) ?? { count: 0, revenue: 0 }
          cur.count += 1
          cur.revenue += r.price_body ?? 0
          byMonth.set(mKey, cur)
        }
        trend = [...byMonth.entries()]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([mKey, v]) => ({
            month: mKey,
            total_sales: v.count,
            total_revenue_yen: Math.round(v.revenue),
            avg_price_yen: v.count > 0 ? Math.round(v.revenue / v.count) : 0,
          }))
      } else {
        // 全車種: 事前集計ビューを使う (速い)
        const { data, error } = await client
          .from('monthly_sales_summary')
          .select('month, total_sales, total_revenue, avg_price')
          .order('month', { ascending: false })
          .limit(months)

        if (error) throw new Error(`月別販売サマリの取得に失敗: ${error.message}`)

        const summary = (data ?? []) as Array<{
          month: string
          total_sales: number | null
          total_revenue: number | null
          avg_price: number | null
        }>

        trend = summary.map((s) => ({
          month: s.month,
          total_sales: s.total_sales ?? 0,
          total_revenue_yen: Math.round(s.total_revenue ?? 0),
          avg_price_yen: Math.round(s.avg_price ?? 0),
        }))
      }

      const grandTotalSales = trend.reduce((s, r) => s + r.total_sales, 0)

      return {
        result: {
          months,
          car_name: car_name ?? null,
          monthly_trend: trend,
          total_sales_in_range: grandTotalSales,
        },
        evidence: {
          function: 'get_sales_performance',
          args: { months, car_name },
          result_count: grandTotalSales,
          snapshot_date: today,
          summary: `${carLabel}直近${trend.length}ヶ月の販売推移 (合計${grandTotalSales}台)`,
        },
      }
    }

    case 'get_market_overview': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const year_min = input.year_min != null ? Number(input.year_min) : undefined
      const year_max = input.year_max != null ? Number(input.year_max) : undefined

      // 30日ローリング（重複除去済み）の市場データを使う。
      // 最新run1本だけだと部分的な日次スクレイプ（例：一部メーカーのみ）で欠落するため、
      // 他の市場ツールと同じ recent_market_observations に統一して安定させる。
      // 正確な掲載件数（PostgREST の行上限に影響されない count）。
      let countQuery = client
        .from('recent_market_observations')
        .select('*', { count: 'exact', head: true })
        .not('price_body_yen', 'is', null)
      if (car_name) countQuery = countQuery.ilike('car_name', `%${car_name}%`)
      if (region) countQuery = countQuery.eq('region_prefecture', region)
      if (year_min != null) countQuery = countQuery.gte('model_year', year_min)
      if (year_max != null) countQuery = countQuery.lte('model_year', year_max)
      const { count: trueCount } = await countQuery

      // 分布・価格帯の集計用サンプル（行上限まで）。
      let obsQuery = client
        .from('recent_market_observations')
        .select('model_year, price_body_yen, region_prefecture, fetched_at')
        .not('price_body_yen', 'is', null)
      if (car_name) obsQuery = obsQuery.ilike('car_name', `%${car_name}%`)
      if (region) obsQuery = obsQuery.eq('region_prefecture', region)
      if (year_min != null) obsQuery = obsQuery.gte('model_year', year_min)
      if (year_max != null) obsQuery = obsQuery.lte('model_year', year_max)
      const { data: obs, error } = await obsQuery.limit(10000)
      if (error) throw new Error(`市場データの取得に失敗: ${error.message}`)
      const listingCount = trueCount ?? (obs ?? []).length

      const rows = (obs ?? []) as Array<{
        model_year: number | null
        price_body_yen: number | null
        region_prefecture: string | null
        fetched_at: string | null
      }>
      const freshness = rows.reduce<string | null>(
        (mx, r) => (r.fetched_at && (!mx || r.fetched_at > mx) ? r.fetched_at : mx),
        null,
      )

      const prices = rows
        .map((r) => r.price_body_yen)
        .filter((p): p is number => p != null && p > 0)
        .sort((a, b) => a - b)
      const toMan = (yen: number) => Math.round(yen / 10000)
      const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null
      const avg =
        prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null

      // 年式分布 (上位)
      const byYear = new Map<number, number>()
      for (const r of rows) {
        if (r.model_year == null) continue
        byYear.set(r.model_year, (byYear.get(r.model_year) ?? 0) + 1)
      }
      const yearDist = [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 10)
        .map(([year, count]) => ({ year, count }))

      // 地域分布 (上位)
      const byRegion = new Map<string, number>()
      for (const r of rows) {
        const reg = r.region_prefecture ?? '不明'
        byRegion.set(reg, (byRegion.get(reg) ?? 0) + 1)
      }
      const regionDist = [...byRegion.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([reg, count]) => ({ region: reg, count }))

      return {
        result: {
          car_name,
          filters: {
            region: region ?? null,
            year_min: year_min ?? null,
            year_max: year_max ?? null,
          },
          data_source: 'カーセンサー（外部市場データ）',
          data_freshness: freshness,
          data_window: '直近30日（重複除去済み）',
          listing_count: listingCount,
          sample_size: rows.length,
          price_range_man: {
            min: prices.length > 0 ? toMan(prices[0]) : null,
            median: median != null ? toMan(median) : null,
            avg: avg != null ? toMan(avg) : null,
            max: prices.length > 0 ? toMan(prices[prices.length - 1]) : null,
          },
          year_distribution: yearDist,
          region_distribution: regionDist,
        },
        evidence: {
          function: 'get_market_overview',
          args: { car_name, region, year_min, year_max },
          result_count: listingCount,
          snapshot_date: today,
          summary: `市場概況(外部): ${car_name || '全体'} ${listingCount}件${region ? ` / ${region}` : ''}`,
        },
      }
    }

    // ───────────────────────────────────────────────────────────────────
    // トレンド系 (時系列): 蓄積された全スナップショット履歴を横断する。
    // ───────────────────────────────────────────────────────────────────
    case 'get_price_trend': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const days = input.days != null ? Number(input.days) : 90

      const points = await fetchPriceTrend(client, { car_name, region, days })
      const toMan = (yen: number | null) => (yen != null ? Math.round(yen / 10000) : null)
      const series = points.map((p) => ({
        date: p.snapshot_date,
        listings: p.listing_count,
        median_man: toMan(p.median_price_yen),
        avg_man: toMan(p.avg_price_yen),
      }))
      const first = series[0]
      const last = series[series.length - 1]
      const priceChange =
        first?.median_man != null && last?.median_man != null
          ? last.median_man - first.median_man
          : null

      return {
        result: {
          car_name,
          region: region ?? '全国',
          days,
          points: series.length,
          series,
          median_price_change_man: priceChange,
          note:
            series.length < 2
              ? 'データ点が不足しています (スナップショットは約3日に1回のため、期間を広げると点が増えます)。'
              : undefined,
        },
        evidence: {
          function: 'get_price_trend',
          args: { car_name, region, days },
          result_count: series.length,
          snapshot_date: last?.date ?? today,
          date_range: first
            ? { from: first.date, to: last.date, points: series.length }
            : undefined,
          summary: `価格推移: ${car_name}${region ? ` / ${region}` : ' / 全国'} 直近${days}日 (${series.length}点)`,
        },
      }
    }

    case 'get_inventory_trend': {
      const car_name = normalizeCarName(input.car_name)
      const region = normalizeRegion(input.region)
      const days = input.days != null ? Number(input.days) : 90

      const points = await fetchInventoryTrend(client, { car_name, region, days })
      const series = points.map((p) => ({ date: p.snapshot_date, listings: p.listing_count }))
      const first = series[0]
      const last = series[series.length - 1]
      const change =
        first && last ? last.listings - first.listings : null
      const direction =
        change == null ? 'unknown' : change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'flat'

      return {
        result: {
          car_name,
          region: region ?? '全国',
          days,
          points: series.length,
          series,
          listing_count_change: change,
          direction,
          note:
            series.length < 2
              ? 'データ点が不足しています (スナップショットは約3日に1回)。'
              : '在庫件数は同一取得条件の run 間でのみ厳密比較が可能です。',
        },
        evidence: {
          function: 'get_inventory_trend',
          args: { car_name, region, days },
          result_count: series.length,
          snapshot_date: last?.date ?? today,
          date_range: first
            ? { from: first.date, to: last.date, points: series.length }
            : undefined,
          summary: `在庫推移: ${car_name}${region ? ` / ${region}` : ' / 全国'} 直近${days}日 (${series.length}点)`,
        },
      }
    }

    case 'get_regional_trend': {
      const car_name = normalizeCarName(input.car_name)
      const regions = Array.isArray(input.regions)
        ? (input.regions as unknown[]).map((r) => String(r))
        : undefined
      const days = input.days != null ? Number(input.days) : 90

      const rows = await fetchRegionalTrend(client, { car_name, regions, days })
      const toMan = (yen: number | null) => (yen != null ? Math.round(yen / 10000) : null)
      const result = rows.map((r) => ({
        region: r.region_prefecture,
        from: r.first_date,
        to: r.last_date,
        count_from: r.first_count,
        count_to: r.last_count,
        count_change: r.count_change,
        median_from_man: toMan(r.first_median_price_yen),
        median_to_man: toMan(r.last_median_price_yen),
        price_change_man: toMan(r.price_change_yen),
      }))
      const dates = rows.flatMap((r) => [r.first_date, r.last_date]).sort()

      return {
        result: {
          car_name,
          days,
          regions_compared: result.length,
          regions: result,
          note:
            result.length === 0
              ? '該当データがありません。期間を広げるか車種名を確認してください。'
              : '件数変化の大きい地域順。在庫増=出回り増であり需要の強さは回転率と併読してください。',
        },
        evidence: {
          function: 'get_regional_trend',
          args: { car_name, regions, days },
          result_count: result.length,
          snapshot_date: dates.length ? dates[dates.length - 1] : today,
          date_range: dates.length
            ? { from: dates[0], to: dates[dates.length - 1], points: result.length }
            : undefined,
          summary: `地域トレンド比較: ${car_name} ${result.length}地域 / 直近${days}日`,
        },
      }
    }

    case 'get_rising_models': {
      const region = normalizeRegion(input.region)
      const days = input.days != null ? Number(input.days) : 60
      const limit = input.limit != null ? Number(input.limit) : 15

      const rows = await fetchRisingModels(client, { region, days, limit })
      const toMan = (yen: number | null) => (yen != null ? Math.round(yen / 10000) : null)
      const result = rows.map((r) => ({
        car_name: r.car_name,
        from: r.first_date,
        to: r.last_date,
        count_from: r.first_count,
        count_to: r.last_count,
        count_change: r.count_change,
        count_change_pct: r.count_change_pct,
        median_man: toMan(r.last_median_price_yen),
      }))
      const dates = rows.flatMap((r) => [r.first_date, r.last_date]).sort()

      return {
        result: {
          region: region ?? '全国',
          days,
          count: result.length,
          models: result,
          note:
            result.length === 0
              ? '比較に十分な履歴がありません (各車種で最低2スナップショット必要)。'
              : '在庫件数の増加量が大きい順。需要の強さは回転率(get_turnover_days)と併せて判断してください。',
        },
        evidence: {
          function: 'get_rising_models',
          args: { region, days, limit },
          result_count: result.length,
          snapshot_date: dates.length ? dates[dates.length - 1] : today,
          date_range: dates.length
            ? { from: dates[0], to: dates[dates.length - 1], points: result.length }
            : undefined,
          summary: `人気上昇車種: ${region ?? '全国'} 直近${days}日 (${result.length}件)`,
        },
      }
    }

    case 'get_terms': {
      // ⑯ 現行の利用規約＋別添（各種料金表）を返し、対応可否・料金の根拠にさせる。
      const agreement = await getActiveAgreement()
      if (!agreement) {
        return {
          result: { available: false, message: '公開中の利用規約がありません。可否は本部にご確認ください。' },
          evidence: {
            function: 'get_terms',
            args: {},
            result_count: 0,
            snapshot_date: today,
            summary: '規約: 公開中なし',
          },
        }
      }
      const attachments = await listAttachments(agreement.id)
      return {
        result: {
          available: true,
          title: agreement.title,
          version: agreement.version,
          body: agreement.body ?? '',
          attachments: attachments.map((a) => ({ title: a.title, body: a.body ?? '' })),
          note: 'ここに明記がない事項は「本部にご確認ください」と案内すること。',
        },
        evidence: {
          function: 'get_terms',
          args: {},
          result_count: attachments.length + 1,
          snapshot_date: today,
          summary: `規約 v${agreement.version} + 別添${attachments.length}件`,
        },
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
