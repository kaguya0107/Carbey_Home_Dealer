-- =====================================================================
-- Carbey Portal — 既存オーダーへの案件（進捗）バックフィル
-- =====================================================================
-- 背景（クライアントレビュー 2026-07-15）:
--   本部オーダー管理で「各オーダーごとの半自動売買の進捗」を可視化する要望。
--   vehicle_deals（migration 023）より前に作成されたオーダーには案件が無く、
--   進捗が「案件なし」と表示されてしまうため、既存オーダーに案件を補完する。
--
--   遷移の割当（オーダー送信＝仕入れ中に自動遷移、という本来の仕様に合わせる）:
--     cancelled  → 対象外（案件を作らない）
--     completed  → delivered（納品完了。ただし settled=false：
--                  自動精算の実装より前の取引のため精算記録は作らない）
--     それ以外   → sourcing（仕入れ中）
--
--   案件が既にあるオーダーは対象外（not exists）。何度実行しても安全（冪等）。
-- =====================================================================

insert into portal.vehicle_deals (
  member_id, order_id, status, maker, car_model, year, order_amount_yen,
  ordered_at, sourcing_at, delivered_at, note
)
select
  o.member_id,
  o.id,
  case when o.status = 'completed' then 'delivered' else 'sourcing' end,
  o.maker,
  o.car_model,
  o.year,
  o.budget_yen,
  o.created_at,
  o.created_at,                                                    -- オーダー送信＝仕入れ中の起点
  case when o.status = 'completed' then o.updated_at else null end,
  '既存オーダーからの補完（029）'
from portal.orders o
where o.status <> 'cancelled'
  and not exists (
    select 1 from portal.vehicle_deals d where d.order_id = o.id
  );
