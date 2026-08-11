-- Carbey Portal — ㊸ 削除された案件の履歴（記録保全）
--
-- 背景：案件（vehicle_deals）は取消／オーダーのキャンセルで hard-delete され、売上・利益の集計から
--   即座に外れる（#36/#39 で検証済み）。ただし「どの案件を・いつ・誰が・なぜ削除したか」の記録が残らない。
-- ㊸ クライアント確定：削除された案件は「別で履歴として保全・表示」する（記録保全の意味があるため前者）。
--
-- 方針：元テーブルは hard-delete のまま（集計に影響させない）。削除の直前に、案件の要点を
--   本表にスナップショットとして保存する。表示は本部のみ。
create table if not exists portal.deleted_deals (
  id                 uuid primary key default gen_random_uuid(),
  original_deal_id   uuid,                                          -- 元の案件ID（参照用・FKは張らない）
  member_id          uuid references portal.members(id) on delete set null,
  flow               text,                                          -- 'auto' | 'semi'
  maker              text,
  car_model          text,
  status_at_deletion text,                                          -- 削除時のステージ（sold, listing, sourcing 等）
  sale_price_yen     bigint,
  cost_total_yen     bigint,
  gross_profit_yen   bigint,
  order_id           uuid,
  order_number       text,
  reason             text,                                          -- 削除理由（取消／オーダー連動 等）
  deleted_by         uuid references auth.users(id) on delete set null,
  deleted_by_name    text,
  deleted_at         timestamptz not null default now()
);

create index if not exists idx_deleted_deals_member on portal.deleted_deals(member_id);
create index if not exists idx_deleted_deals_deleted_at on portal.deleted_deals(deleted_at desc);

comment on table portal.deleted_deals is '削除された案件の記録保全ログ（㊸）。hard-delete 前のスナップショット。閲覧は本部のみ';

-- RLS：本部スタッフのみ閲覧（audit_logs と同方針）。書き込みは service_role 経由のみ。
alter table portal.deleted_deals enable row level security;
drop policy if exists portal_deleted_deals_staff_read on portal.deleted_deals;
create policy portal_deleted_deals_staff_read on portal.deleted_deals
  for select using (portal.is_staff(auth.uid()));
