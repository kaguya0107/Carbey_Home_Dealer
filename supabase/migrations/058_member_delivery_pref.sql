-- Carbey Portal — #52改 加盟店ごとの「陸送先の都道府県（拠点）」
--
-- 背景（クライアント確定）：
--   陸送費の発地は本部拠点＝神奈川県（全体設定）。一方、陸送先（着地）の初期値は
--   全加盟店を一律「神奈川県」にするのではなく、**各加盟店の拠点（都道府県）をデフォルト**にする。
--   加盟店の陸送先はこれまで住所（自由文）のみで都道府県が無いため、構造化した都道府県を追加する。
--
--   新規案件の to_pref（着地）や、案件画面の陸送先の初期選択に使う。null なら全体のフォールバックを使用。
alter table portal.members
  add column if not exists delivery_pref text;

comment on column portal.members.delivery_pref is
  '陸送先（着地）の拠点都道府県。新規案件の陸送先の初期値になる（#52改）。null なら全体のデフォルト陸送先を使用';
