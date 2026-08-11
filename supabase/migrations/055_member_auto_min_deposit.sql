-- Carbey Portal — ㊵ 自動売買の枠：最低値・最高値を加盟者ごとに設定可能に
--
-- 背景（クライアント㊵の確定仕様）：
--   自動売買の「枠」は、加盟者ごとに 最低値・最高値 を任意設定できるようにする。
--   ・最高値（members.capital_per_slot_yen＝既存）＝ 1枠あたりの運用資金。枠数はこの最高値を基準にカウント。
--       有効枠 = min(保有枠, floor(予算 ÷ 最高値))
--   ・最低値（本マイグレーションで追加＝auto_min_deposit_yen）＝ 受注をロックする最低預かり金。
--       予算 < 最低値 なら全枠ロック。
--   ・両者を揃える（最低値=最高値）と、その値ごとに枠カウント（例：最低=最高=100万・予算200万→2枠）。
--   ・別々（例：最低100万〜最高400万）なら、枠は最高値=400万ごとにカウント。
--
-- これまで最低値は全体設定（auto_min_deposit）のみだったため、加盟者ごとに持てるようにする。
-- null の場合は従来どおり全体設定の値を使う（後方互換）。

alter table portal.members
  add column if not exists auto_min_deposit_yen bigint;

comment on column portal.members.auto_min_deposit_yen is
  '自動売買の最低値（受注ロックの最低預かり金）。加盟者ごとに任意設定。null なら全体設定 auto_min_deposit を使用（㊵）';

comment on column portal.members.capital_per_slot_yen is
  '自動売買の最高値（1枠あたりの運用資金）。枠数はこの値を基準にカウント＝floor(予算÷最高値)（㊵・#17）';
