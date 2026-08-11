-- 051: プランに「ロイヤリティ (%)」項目を追加（#20）
-- 請求区分には royalty（ロイヤリティ）が既にあるが、プランごとの料率設定項目が無かったため追加。
alter table portal.plans add column if not exists royalty_pct numeric(5,2) not null default 0;
comment on column portal.plans.royalty_pct is 'ロイヤリティ料率（％）。プランごとに設定（#20）';
