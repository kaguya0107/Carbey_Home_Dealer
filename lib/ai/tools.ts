/**
 * Claude API に渡す Tool 定義。Anthropic SDK の Tool 型に準拠。
 *
 * 6つの Tool は Phase 1 で構築した分析関数の薄いラッパーになる。
 * AI は生 SQL を書けず、これらの「事前定義された分析関数」だけを通じて
 * データにアクセスする — 安全境界とコスト境界が明確化される。
 *
 * Phase2 追加: 年式・走行距離・価格帯フィルタ、compare_regions Tool。
 */
import type { AITool } from './providers/types'

export const TOOLS: AITool[] = [
  {
    name: 'get_popularity',
    description:
      '指定された車種・地域のボディカラー人気分布を取得します。' +
      '結果は色ごとの件数と比率(%)の配列です。' +
      '地域(region)を省略すると全国集計を返します。' +
      'year_min/year_max/price_min_yen/price_max_yen/mileage_max_km で絞り込み可能。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: プリウス' },
        region: { type: 'string', description: '都道府県名 (省略可)' },
        year_min: { type: 'number', description: '最小年式 例: 2018 (省略可)' },
        year_max: { type: 'number', description: '最大年式 (省略可)' },
        price_min_yen: { type: 'number', description: '最低車両本体価格(円) 例: 1000000 (省略可)' },
        price_max_yen: { type: 'number', description: '最高車両本体価格(円) (省略可)' },
        mileage_max_km: { type: 'number', description: '最大走行距離(km) 例: 50000 (省略可)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'get_turnover_days',
    description:
      '指定された車種・地域の平均/中央売却日数 (回転率) を取得します。' +
      'sold_estimations テーブルから集計されており、過去に市場から消えた車両のデータが基準。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名' },
        region: { type: 'string', description: '都道府県名 (省略可)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'get_price_distribution',
    description:
      '指定された車種の価格分布 (10万円刻みのヒストグラム) を取得します。' +
      '結果には件数・中央価格・平均価格が含まれます。' +
      'year_min/year_max で年式絞り込み可能。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名' },
        region: { type: 'string', description: '都道府県名 (省略可)' },
        year_min: { type: 'number', description: '最小年式 (省略可)' },
        year_max: { type: 'number', description: '最大年式 (省略可)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'count_sold_recent',
    description:
      '直近 N 日の売却推定件数 (市場から消えた車両数) を取得します。' +
      '車種・地域フィルタも可。「最近どれくらい売れているか」の把握に使います。',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '何日前までを集計するか (1〜90)' },
        car_name: { type: 'string', description: '車種名 (省略可)' },
        region: { type: 'string', description: '都道府県名 (省略可)' },
      },
      required: ['days'],
    },
  },
  {
    name: 'get_own_inventory',
    description:
      '自社在庫の一覧を取得します。滞留日数・価格・市場中央価格との乖離率も含みます。' +
      '「滞留が長い車両は？」「プリウスの在庫状況は？」「価格を見直すべき車両は？」などの質問に使います。' +
      '車種名(car_name)で絞り込み可能。省略すると全在庫を返します。' +
      '結果には各車両の stagnation_days（滞留日数）、price_body（本体価格）、' +
      'market_median_price（市場中央値）、price_gap_pct（乖離率%）が含まれます。' +
      'sort=stagnation で滞留日数降順、sort=price_gap で乖離率降順。' +
      '**fleet_summary には在庫全体の台数集計（総在庫・要対応90日超・注視・正常）が limit に関係なく入っているので、' +
      '「在庫全体で何台」という台数の話は必ず fleet_summary を使うこと。vehicles は詳細表示用の一部（is_truncated 参照）。**',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名で絞り込み (省略可) 例: プリウス' },
        sort: { type: 'string', description: 'stagnation (滞留降順) | price_gap (乖離降順) | newest (省略時)' },
        stagnation_min_days: { type: 'number', description: '最小滞留日数 例: 90 (省略可)' },
        limit: { type: 'number', description: '詳細を返す件数 (デフォルト20, 最大100)。台数集計は fleet_summary が全件ベース。' },
      },
      required: [],
    },
  },
  {
    name: 'get_market_gap',
    description:
      '自社在庫の指定車両について、市場中央価格との差を算出します。' +
      '「自社の○○は市場より高い/安い」という価格戦略判断に使います。' +
      'inventory_id は自社在庫テーブルの主キー UUID です。' +
      '※車両IDが不明な場合は get_own_inventory で先に一覧を取得してください。',
    input_schema: {
      type: 'object',
      properties: {
        inventory_id: { type: 'string', description: '自社在庫の id (UUID)' },
      },
      required: ['inventory_id'],
    },
  },
  {
    name: 'compare_regions',
    description:
      '同一車種について、指定された複数の都道府県を一度に比較します。' +
      '各地域の在庫数・中央価格・平均売却日数・人気色トップを並べて返すので、' +
      '「神奈川と大阪のプリウス比較」のような質問に最適。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: プリウス' },
        regions: {
          type: 'array',
          description: '比較したい都道府県名の配列 (2〜5件推奨)',
          items: { type: 'string' },
        },
      },
      required: ['car_name', 'regions'],
    },
  },
  {
    name: 'get_sold_breakdown',
    description:
      '指定車種の売却済み車両をグレード・年式・色・価格帯・走行距離で詳細分析します。' +
      'スナップショット差分で「市場から消えた＝売却された」と判定した実データが根拠です。' +
      '「30後期と50前期の割合を教えて」「黒の走行3〜5万の価格帯は？」のような具体的な質問に最適。' +
      'year_min/year_max で年式絞り込み、grade でグレード部分一致、days で集計期間(デフォルト90日)を指定。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: プリウス' },
        region: { type: 'string', description: '都道府県名 (省略可)' },
        days: { type: 'number', description: '何日前までを集計 (1〜180, 省略時90)' },
        year_min: { type: 'number', description: '最小年式 例: 2015 (省略可)' },
        year_max: { type: 'number', description: '最大年式 例: 2020 (省略可)' },
        grade: { type: 'string', description: 'グレード名の一部 例: Aプレミアム (省略可)' },
        color: { type: 'string', description: 'ボディカラー 例: ブラック (省略可)' },
        mileage_max_km: { type: 'number', description: '最大走行距離km 例: 50000 (省略可)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'get_sales_performance',
    description:
      '自社の販売実績（実際に売れた車両の月別サマリ）を取得します。' +
      '「先月は何台売れた?」「今月の売上は?」「平均単価は?」「粗利は?」「月別の販売推移」' +
      'などの自社の成約・売上に関する質問に使います。' +
      'month を指定すると単月の詳細を返します。' +
      '内訳には集計値（販売台数・売上高・平均単価・粗利・粗利率）に加え、' +
      'vehicles 配列として個々の売却車両（車両コード・グレード・年式・走行距離・販売価格・販売日）も含まれます。' +
      '「売れた車両の年式・グレード・走行距離を教えて」のような明細の質問にもこのツールで答えられます。' +
      'month を省略すると直近 months ヶ月分の月別推移（台数・売上・平均単価）を返します。' +
      'car_name を指定すると、その車種に絞った販売実績だけを集計します（部分一致）。' +
      '※ market 系ツール（相場・回転率）とは別で、これは「自社が実際に売った実績」のデータです。',
    input_schema: {
      type: 'object',
      properties: {
        month: {
          type: 'string',
          description: '対象月 YYYY-MM 形式 例: 2026-05 (省略時は直近数ヶ月の推移を返す)',
        },
        months: {
          type: 'number',
          description: '月別推移を返す際の遡る月数 (1〜24, デフォルト6)。month 指定時は無視。',
        },
        car_name: {
          type: 'string',
          description: '車種名で絞り込み (部分一致, 省略可) 例: プリウス',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_market_overview',
    description:
      '指定車種の「いま市場（カーセンサー）に出回っている在庫」の全体像を取得します。' +
      '外部の中古車市場データ（自社外の他社掲載）を集約したもので、' +
      '掲載件数・価格レンジ（最安/中央/最高）・年式分布・地域分布・データ取得日時を返します。' +
      '「○○の市場の状況は?」「相場感を教えて」「今どれくらい出回ってる?」のような' +
      'オープンな相場の壁打ちに最適。返り値の data_source / data_freshness で外部由来・取得時点を明示できます。' +
      '※ これは自社の販売実績(get_sales_performance)ではなく、外部の市場掲載データです。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: プリウス' },
        region: { type: 'string', description: '都道府県名 (省略可)' },
        year_min: { type: 'number', description: '最小年式 (省略可)' },
        year_max: { type: 'number', description: '最大年式 (省略可)' },
      },
      required: ['car_name'],
    },
  },
  // ───────────────────────────────────────────────────────────────────────
  // トレンド系 (時系列) Tool — 蓄積された全スナップショット履歴を横断して
  // 「過去からの変化」を返す。最新断面だけを見る他 Tool と違い、
  // 価格・在庫・地域の推移を自動的に参照できる (手動でのスナップショット選択は不要)。
  // データ点は ~3日に1回の取得間隔のため不等間隔 (各点に snapshot_date が付く)。
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'get_price_trend',
    description:
      '指定車種(+地域)の中央価格・平均価格の【時系列推移】を取得します。' +
      '蓄積された過去スナップショット全体から、各取得時点(snapshot_date)の価格を古い順に返します。' +
      '「最近ヤリスは値下がりしている?」「プリウスの相場はこの3ヶ月でどう動いた?」のような' +
      '価格トレンドの質問に使います。days で遡る日数(デフォルト90)を指定。' +
      'region 省略時は全国集計の推移を返します。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: ヤリス' },
        region: { type: 'string', description: '都道府県名 (省略可, 省略時は全国)' },
        days: { type: 'number', description: '遡る日数 例: 30 / 60 / 90 (省略時90)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'get_inventory_trend',
    description:
      '指定車種(+地域)の【掲載在庫件数の時系列推移】を取得します。' +
      '各取得時点の市場掲載件数を古い順に返し、在庫が増えているか減っているかを判断できます。' +
      '「ヤリスの市場在庫は増えてる?減ってる?」「最近出回りが増えた?」のような質問に使います。' +
      '※ 件数は取得条件(テンプレート)が同一の run 間でのみ比較が妥当です。' +
      'days で遡る日数(デフォルト90)、region 省略時は全国。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: ヤリス' },
        region: { type: 'string', description: '都道府県名 (省略可, 省略時は全国)' },
        days: { type: 'number', description: '遡る日数 例: 30 / 60 / 90 (省略時90)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'get_regional_trend',
    description:
      '指定車種について、複数地域の【期間始点→終点での在庫件数・中央価格の変化量】を比較します。' +
      '「どの地域が強い/伸びている?」を時系列の変化で答えるのに使います。' +
      '各地域の first→last の件数変化・価格変化を、在庫増加量の大きい順で返します。' +
      'regions を省略すると、データのある全地域を比較対象にします。days で期間指定(デフォルト90)。',
    input_schema: {
      type: 'object',
      properties: {
        car_name: { type: 'string', description: '車種名 例: プリウス' },
        regions: {
          type: 'array',
          description: '比較したい都道府県名の配列 (省略時は全地域)',
          items: { type: 'string' },
        },
        days: { type: 'number', description: '遡る日数 (省略時90)' },
      },
      required: ['car_name'],
    },
  },
  {
    name: 'get_rising_models',
    description:
      '【人気上昇車種ランキング】を取得します。蓄積履歴から、期間始点→終点で' +
      '市場掲載在庫件数の増加が大きい車種を返します。' +
      '「最近どの車種が伸びてる?」「注目の車種は?」のような質問に使います。' +
      '※ 在庫件数の増加は「市場での出回りの増加」であり、需要の強さは回転率(get_turnover_days)と併せて判断してください。' +
      'region 省略時は全国、days で期間(デフォルト60)、limit で件数(デフォルト15)。',
    input_schema: {
      type: 'object',
      properties: {
        region: { type: 'string', description: '都道府県名 (省略可, 省略時は全国)' },
        days: { type: 'number', description: '遡る日数 (省略時60)' },
        limit: { type: 'number', description: '返す車種数 (省略時15)' },
      },
      required: [],
    },
  },
]

export type ToolName =
  | 'get_popularity'
  | 'get_turnover_days'
  | 'get_price_distribution'
  | 'count_sold_recent'
  | 'get_own_inventory'
  | 'get_market_gap'
  | 'compare_regions'
  | 'get_sold_breakdown'
  | 'get_sales_performance'
  | 'get_market_overview'
  | 'get_price_trend'
  | 'get_inventory_trend'
  | 'get_regional_trend'
  | 'get_rising_models'

/**
 * 加盟店AI（β）で公開する市場ツール。
 * 確定モデル：カーセンサー市場データのスナップショットの検索。
 * 自社在庫/自社販売系（get_own_inventory / get_sales_performance / get_market_gap）は
 * 単一テナントの自社データに密結合のため、加盟店βでは公開しない（後続で vehicle_deals へマッピング）。
 */
// 信頼できるサブセット（30日ローリングの実データで検証済み・正確）。
// 除外中のツール（成約/回転/急上昇/トレンド系）は、現状の分割スクレイピング（県ごとの巡回で
// 619k件/月の見かけ上の「消失」が発生）では正確に出せないため一時除外。収集の平準化（P2 全国化）後に
// データソースを再構築して再開する（テスト報告 Part2 参照）。
export const MEMBER_MARKET_TOOL_NAMES: ToolName[] = [
  'get_market_overview',
  'get_popularity',
  'get_price_distribution',
  'compare_regions',
]

export const MEMBER_MARKET_TOOLS: AITool[] = TOOLS.filter((t) =>
  (MEMBER_MARKET_TOOL_NAMES as string[]).includes(t.name),
)
