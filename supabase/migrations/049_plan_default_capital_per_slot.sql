-- 049: プランに「自動売買 1枠あたり上限額（運用資金）」のデフォルトを追加（#17）
--
-- これまで members.capital_per_slot_yen（1枠あたり必要運用資金・既定400万）は会員ごとに設定していた。
-- 本migrationでプラン側に既定値を持たせ、会員作成時に空欄ならプラン既定を適用できるようにする。
-- （有効枠 = min(保有枠, 預かり金 ÷ capital_per_slot_yen) の分母に使う値のデフォルト）

alter table portal.plans add column if not exists default_capital_per_slot_yen int not null default 4000000;
comment on column portal.plans.default_capital_per_slot_yen is '自動売買 1枠あたり上限額（運用資金）の既定。会員作成時に capital_per_slot_yen の初期値として使う（#17）';
