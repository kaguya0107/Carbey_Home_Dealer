-- =====================================================================
-- Carbey Portal — Phase 2: お知らせ配信（本部 → 全加盟店）
-- =====================================================================
-- 本部が全加盟店向けのお知らせを投稿する。加盟店ダッシュボードに一覧表示。
-- 投稿時に全 active 加盟店の user_id 宛て通知を fan-out し、通知ベルも点く。
-- 冪等化のため if exists / or replace を併用。
-- =====================================================================

create table if not exists portal.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  -- 重要度（important は加盟店側で強調表示）
  level       text not null default 'info' check (level in ('info', 'important')),
  published   boolean not null default true,
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_announcements_created on portal.announcements(created_at desc);

drop trigger if exists trg_announcements_touch on portal.announcements;
create trigger trg_announcements_touch
  before update on portal.announcements
  for each row execute function portal.touch_updated_at();

-- ---------------------------------------------------------------------
-- お知らせ投稿時に、全 active 加盟店へ通知を fan-out する
-- ---------------------------------------------------------------------
create or replace function portal.notify_announcement()
returns trigger language plpgsql security definer set search_path = portal as $$
begin
  if new.published then
    insert into portal.notifications (user_id, audience, kind, title, message)
    select m.user_id, 'user', 'announcement', new.title, left(new.body, 80)
      from portal.members m
     where m.user_id is not null and m.status = 'active';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_announcement_notify on portal.announcements;
create trigger trg_announcement_notify
  after insert on portal.announcements
  for each row execute function portal.notify_announcement();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table portal.announcements enable row level security;

-- 閲覧：ログインユーザー全員（本部・加盟店とも公開分を見る）
drop policy if exists portal_announcements_read on portal.announcements;
create policy portal_announcements_read on portal.announcements
  for select using (auth.uid() is not null);

-- 作成・更新・削除：本部（can_crm 以上）
drop policy if exists portal_announcements_write on portal.announcements;
create policy portal_announcements_write on portal.announcements
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- GRANT（001 と同じ方針。新規テーブルなので明示付与）
grant select on portal.announcements to anon, authenticated;
grant insert, update, delete on portal.announcements to authenticated;
grant all on portal.announcements to service_role;
