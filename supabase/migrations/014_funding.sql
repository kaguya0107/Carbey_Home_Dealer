-- =====================================================================
-- Carbey Portal — オンボーディング再設計 フェーズ④: 資金準備（分岐）
-- =====================================================================
-- クライアント要件（レビュー ⑪ / ⑭画像 ②資金準備）:
--   自己資金で始める場合: 自己資金額を登録 → 本部確認 → 完了
--   資金調達を利用する場合:
--     資金調達申請 → ヒアリング → 必要書類提出 → 事業計画書作成 →
--     金融機関へ申請 → 融資審査 → 融資契約 → 着金確認 → 完了
--   自動/手動を分離。手動は最小限。
--
-- funding_applications: 加盟店ごとに1つ。method で分岐。
--   loan の各ステップは step_status(jsonb) で 'todo'|'done' を保持。
-- 冪等化のため if exists / on conflict を併用。
-- =====================================================================

create table if not exists portal.funding_applications (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null unique references portal.members(id) on delete cascade,
  method       text check (method in ('self', 'loan')),   -- 未選択なら null
  self_amount_yen bigint,                                  -- 自己資金の場合
  self_confirmed boolean not null default false,          -- 本部確認（自己資金）
  -- 資金調達（loan）の各ステップ状態。キー=ステップ, 値='todo'|'done'
  step_status  jsonb not null default '{}'::jsonb,
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_funding_member on portal.funding_applications(member_id);

drop trigger if exists trg_funding_touch on portal.funding_applications;
create trigger trg_funding_touch
  before update on portal.funding_applications
  for each row execute function portal.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table portal.funding_applications enable row level security;

drop policy if exists portal_funding_read on portal.funding_applications;
create policy portal_funding_read on portal.funding_applications
  for select using (
    portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid())
  );

-- 加盟店: 自分の分の作成・更新（方法選択・自己資金額・加盟店側ステップ）
drop policy if exists portal_funding_member_insert on portal.funding_applications;
create policy portal_funding_member_insert on portal.funding_applications
  for insert with check (member_id = portal.current_member_id(auth.uid()));
drop policy if exists portal_funding_member_update on portal.funding_applications;
create policy portal_funding_member_update on portal.funding_applications
  for update using (member_id = portal.current_member_id(auth.uid())) with check (member_id = portal.current_member_id(auth.uid()));

-- 本部: 全件更新（承認・本部側ステップ）
drop policy if exists portal_funding_staff_update on portal.funding_applications;
create policy portal_funding_staff_update on portal.funding_applications
  for update using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- GRANT
grant select, insert, update on portal.funding_applications to authenticated;
grant all on portal.funding_applications to service_role;
