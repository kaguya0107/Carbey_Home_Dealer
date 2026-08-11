# スナップショット機能 設計（本部・自動スナップショット中心）

クライアント修正依頼 #3〜#6（2026-08-11・番号リセット後）＋追補（2026-08-11）への対応設計。

## 着地点（クライアント合意）
- 加盟店側からの取得は重い → **本部（運営）管理画面で「AI分析用スナップショット」の設定を行い、人的操作なく自動的にスナップショットを繰り返す**。
- **突合分析・範囲分析**は分析サイトと同様の使用感で。
- **自動スクレイピングの性能・信頼性を担保**（＋クライアントは「自動収集が進んでいない」と懸念）。

## 調査で判明した事実（重要）
1. **自動収集は稼働中**：直近80run すべて `scheduled/success`、2〜4時間おき、毎日2〜4万件を取込。市場データは新鮮（`recent_market_observations` ≈ 11.8万件・当日更新）。
2. **実スクレイパは常時稼働の VPS（Python `cs_market_intel`）**。Vercel(サーバーレス)では動かせないため、実取得は今後もVPSが担う。
3. **巡回対象の真の駆動元＝共有テーブル `cs_market_search_templates`（Node/共有DB）**。VPS cron が15分毎に Node の定期取得エンドポイント（`app/api/cron/market-intelligence-scheduled`）を叩き、`scheduled_enabled=ON` かつ 時刻ウィンドウ内 かつ 前回から3日以上経過したテンプレを run 化 → Python は渡された run を実行するだけ（`cli_snapshot <run_id>`）。運用ON/OFF（`CS_MARKET_FETCH_ENABLED`）は **VPSの.env**（DBでもテンプレでもない）。※旧記載の `cs_market_area_makers` は area 調査キャッシュであり巡回の駆動元ではない。
4. **「止まって見える」原因**：アプリ内の別スケジューラ項目（`scheduled_fetch_enabled=false`）や `cs_market_prefecture_counts.fetched_at`（area 調査時しか更新されず古い）が誤解を招く。実収集は健全（+2.5万件/24h・7日成功率100%）だが、**有効テンプレが8県（関東2＋関西6）に限定**され残り39県は対象外＝これが「網羅的でない」の正体。

## 設計方針
**ポータル本部画面＝VPSスクレイパの「設定フロント＋監視」。実取得はVPSが担う（Pythonをポータルで動かさない＝Vercel可）。**

### A. 本部：スナップショット設定（VPSが読む共有DBを編集）＝ **P2 実装済み**
- **巡回対象テンプレ**：`cs_market_search_templates`（対象県×メーカー・取得時刻・有効/無効）を本部が管理。← 収集カバレッジの実駆動元。
- 追加/編集/有効化 → **VPSが次巡回で反映**（人的操作なしで自動継続）。分析サイトの定期取得とも共有。
- 方針：クライアント選択により **「管理UIのみ」**（全国一括自動生成はしない。対象は本部が個別に決定）。
- 対象外：運用ON/OFF（`CS_MARKET_FETCH_ENABLED`＝VPSの.env）はポータル管轄外。

### B. 本部：スナップショット状況・監視（＝「進んでいる」を可視化）
- **実行履歴**：`cs_market_snapshot_runs`（時刻・status・取込数・対象条件）。
- **日別取込数・成功率**の推移。
- **カバレッジ／鮮度**：メーカー×地域ごとの最終取得日時（`cs_market_prefecture_counts`／`area_makers`）＝「どこが古いか」を明示。
- **鮮度アラート**（任意）：一定期間更新のない対象を警告。
- ※誤解を招く `scheduled_fetch_*` は使わず、**実runと鮮度**を表示。

### C. 本部：突合分析・範囲分析
- 蓄積データ（`recent_market_observations` 30日ローリング）で、価格帯・年式・地域分布の**比較（突合）**・**範囲集計**。既存の市場集計ロジックを流用（`get_market_overview` 相当）。

### D. 注意書き（#6）
- 要点・一度にできる範囲・条件設定を掲示。**本部が自由編集**（新規 `portal.editable_notes(key,title,body,updated_at)`・migration 062）。

### E. 加盟店側（従来案の縮小・#3/#4）
- 会員は**取得済みデータの範囲選択・検索・突合（閲覧/分析のみ）**。取得ボタンは持たない。
- 左メニューは増やさず、オンボード内に**状況＋範囲検索**を段階表示（#4）。ショートカット（#3）。

## 実装接続点
- `lib/portal/market-snapshot.ts`（public 読み取り：状況・カバレッジ・範囲集計・突合）。
- `lib/portal/snapshot-config.ts`（本部：`cs_market_*` 設定の読み書き＝VPSへの指示）。
- 本部UI：`app/admin/(market-snapshot)/…`（設定＋監視＋突合）。※本部側は左メニュー方針の対象外だが、既存の本部ナビ枠に収める。
- `portal.editable_notes`（migration 062）＋本部編集UI＋会員/本部表示。

## 段階実装
1. ~~**P1 監視**~~ **実装済み**：`/admin/market-snapshot`（状況・日別取込・実行履歴・カバレッジ/鮮度）。誤解を招く `scheduled_fetch_*`／`prefecture_counts.fetched_at` は使わず実runと実観測で鮮度算出。
2. ~~**P2 設定**~~ **実装済み**：`/admin/market-snapshot/settings`（`cs_market_search_templates` の管理＝対象県×メーカー・時刻・有効化）。CRUD をE2E検証済み（本番テーブルに残骸なし）。
3. ~~**P3 突合分析・範囲分析**~~ **実装済み**：`/admin/market-snapshot/analysis`。`recent_market_observations` 30日ローリングで価格帯・年式・地域を集計。1スコープ=範囲分析／2スコープ=突合（A/B比較）。件数はhead正確・統計は最大1000件のcs_stock_id順サンプル（地域偏りを回避）。
4. ~~**P4 注意書き（migration 062）**~~ **実装済み（migration 062は適用待ち）**：`portal.editable_notes`（本部が自由編集）＋本部編集画面 `/admin/notes`（設定ナビ）＋加盟店AIページ `/portal/ai` 上部に注意書きを表示。方針転換（加盟者は操作しない）に合わせ、加盟店側は「AI＋注意書き表示」に留め、別途の閲覧操作ビューは作らない。

## 実装ファイル（P1/P2/P3/P4）
- 監視(P1)：`lib/portal/market-snapshot.ts` ＋ `app/admin/market-snapshot/page.tsx`
- 設定(P2)：`lib/portal/snapshot-config.ts`（MAKERS/REGION_PRESETS/CRUD）＋ `app/admin/market-snapshot/settings/{page,actions}.ts` ＋ `components/admin/SnapshotTemplateManager.tsx`
- 分析(P3)：`lib/portal/market-analysis.ts`（analyzeScope）＋ `app/admin/market-snapshot/analysis/{page,actions}.ts` ＋ `components/admin/MarketAnalysisPanel.tsx`
- 注意書き(P4)：`supabase/migrations/062_editable_notes.sql`＋`lib/portal/editable-notes.ts`（NOTE_REGISTRY）＋`app/admin/notes/{page,actions}.ts`＋`components/admin/EditableNotesEditor.tsx`＋`app/portal/ai/page.tsx`（表示）＋types登録
- 共通：`components/admin/SnapshotTabs.tsx`（収集状況/収集設定/突合・範囲分析タブ）、`lib/supabase/admin.ts::createPublicWriteClient()`、本部ナビ1項目「市場スナップショット」

## 性能担保・信頼性
- 実行元はVPS（常時稼働）＝担保元。ポータルは**可視化・監視・スコープ調整**で「機能している／どこが古い」を明確化。
- カバレッジ偏りは、対象定義（area_makers）と巡回の見直しで平準化を検討（P2/P3）。

## 対象外
- ポータル（Vercel）からのPythonスクレイピング起動（不可）。実取得はVPS。
