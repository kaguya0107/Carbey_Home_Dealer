-- Carbey Portal — 簡易ダイレクトプライシング（⑳）
--
-- 背景（検収 追加 ⑳）：加盟者AIに簡易ダイレクトプライシングを実装。
--   半自動売買の販売中車両について、加盟者が想定販売価格を入力すると、カーセンサー掲載データ内で
--   その価格が何番手かを算出し、安い方の競合5件（URL付き）を提示して早期売却の価格判断を促す。
--   「設定中」フラグを deal に持たせ、AI相談ページと半自動売買の案件ボードで可視化する。

alter table portal.vehicle_deals
  add column if not exists direct_pricing_at timestamptz,          -- 非null=ダイレクトプライシング設定中
  add column if not exists direct_pricing_target_yen bigint;       -- 加盟者が入力した想定販売価格（本体・円）

comment on column portal.vehicle_deals.direct_pricing_at is 'ダイレクトプライシング設定中の日時（⑳）。null=未設定。';
comment on column portal.vehicle_deals.direct_pricing_target_yen is 'ダイレクトプライシングの想定販売価格（本体・円）。順位算出の基準。';
