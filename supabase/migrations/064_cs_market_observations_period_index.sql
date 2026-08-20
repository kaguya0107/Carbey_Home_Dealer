-- Carbey Portal — 市場データ（累積）への期間分析用インデックス（③ 期間指定＋累積データの高速化）
--
-- 背景（検収 修正確認 ③）：分析に「収集期間」を指定して累積データ（cs_market_observations・約150万件）を
--   集計できるようにした。しかし現状インデックスが無く、「車種×地域×期間」の絞り込み走査が
--   ステートメントタイムアウト（8秒）に達して失敗する。以下のインデックスで期間クエリを高速・安定化する。
--
-- 対象：public.cs_market_observations（＝分析サイトと共有の市場データ表）。読み取り最適化のみ・データ変更なし。
-- ※ このテーブルは portal スキーマではなく共有 public スキーマのため、本ファイルは SETUP_ALL.sql には含めない
--   （portal 再構築の対象外。共有DBに一度だけ適用する最適化）。
--
-- 適用上の注意：
--   ・大きめの表のため作成に1〜数分かかることがあります。
--   ・下記は通常の CREATE INDEX です。作成中は当該表への「書き込み」が一時待機します（読み取りは可）。
--     VPSの収集が少ない時間帯での適用を推奨します。
--   ・無停止で作りたい場合は、各 create index を CONCURRENTLY 付き・トランザクション外で個別実行してください
--     （例：create index concurrently if not exists ...）。

-- 1) ILIKE '%車種%'（先頭ワイルドカード）を効かせるトライグラム索引 → 全国×車種の期間検索を高速化
create extension if not exists pg_trgm;
create index if not exists idx_cs_obs_car_name_trgm
  on public.cs_market_observations using gin (car_name gin_trgm_ops);

-- 2) 地域＋日時(降順) → 地域指定＋期間の走査・並び替えを高速化（最頻ケース）
create index if not exists idx_cs_obs_region_fetched
  on public.cs_market_observations (region_prefecture, fetched_at desc);

-- 3) 日時(降順) → 全国×期間の範囲・並び替えを補助
create index if not exists idx_cs_obs_fetched
  on public.cs_market_observations (fetched_at desc);
