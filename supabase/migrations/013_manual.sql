-- =====================================================================
-- Carbey Portal — オンボーディング再設計 フェーズ③: 実践マニュアル（動的）
-- =====================================================================
-- クライアント要件（レビュー ⑭⑮）:
--   - 実践マニュアルはチェックボックス形式。全項目チェックで次へ進める
--   - 項目：中古車市場の基礎/相場の見方/AI壁打ちで候補整理/仕入れ基準/
--           出品ルール/禁止事項・注意事項/理解度チェック/修了
--   - ローンチ前後で本部が内容を埋める。項目はバックエンドで追加でき、
--     コメントや内容も編集できる（動的なマニュアルCMS）
--
-- manual_sections  : 本部が管理する項目（追加/編集/公開/並び替え）
-- manual_progress  : 加盟店のチェック状況
-- 冪等化のため if exists / on conflict を併用。
-- =====================================================================

create table if not exists portal.manual_sections (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,          -- 項目名
  body        text,                    -- 内容（本部がローンチ後に追記）
  note        text,                    -- 本部コメント
  sort_order  int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_manual_sections_order on portal.manual_sections(sort_order);

drop trigger if exists trg_manual_sections_touch on portal.manual_sections;
create trigger trg_manual_sections_touch
  before update on portal.manual_sections
  for each row execute function portal.touch_updated_at();

create table if not exists portal.manual_progress (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references portal.members(id) on delete cascade,
  section_id  uuid not null references portal.manual_sections(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  unique (member_id, section_id)
);

create index if not exists idx_manual_progress_member on portal.manual_progress(member_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table portal.manual_sections enable row level security;
alter table portal.manual_progress enable row level security;

-- 項目: 閲覧はログインユーザー全員（公開分）／編集は本部
drop policy if exists portal_manual_sections_read on portal.manual_sections;
create policy portal_manual_sections_read on portal.manual_sections
  for select using (auth.uid() is not null);
drop policy if exists portal_manual_sections_write on portal.manual_sections;
create policy portal_manual_sections_write on portal.manual_sections
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- チェック: 本部は全件閲覧／加盟店は自分の分の閲覧・作成・削除（チェック外し）
drop policy if exists portal_manual_progress_read on portal.manual_progress;
create policy portal_manual_progress_read on portal.manual_progress
  for select using (
    portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid())
  );
drop policy if exists portal_manual_progress_insert on portal.manual_progress;
create policy portal_manual_progress_insert on portal.manual_progress
  for insert with check (member_id = portal.current_member_id(auth.uid()));
drop policy if exists portal_manual_progress_delete on portal.manual_progress;
create policy portal_manual_progress_delete on portal.manual_progress
  for delete using (member_id = portal.current_member_id(auth.uid()));

-- GRANT
grant select, insert, update, delete on portal.manual_sections to authenticated;
grant select, insert, delete on portal.manual_progress to authenticated;
grant all on portal.manual_sections, portal.manual_progress to service_role;

-- ---------------------------------------------------------------------
-- 既定の実践マニュアル項目（初回のみ・空なら投入）
-- 中身（body）は空。ローンチ後に本部が埋める前提。
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from portal.manual_sections) then
    insert into portal.manual_sections (title, sort_order) values
      ('中古車市場の基礎',       10),
      ('相場の見方',             20),
      ('AI壁打ちで候補整理',     30),
      ('仕入れ基準',             40),
      ('出品ルール',             50),
      ('禁止事項・注意事項',     60),
      ('理解度チェック',         70),
      ('修了',                   80);
  end if;
end $$;
