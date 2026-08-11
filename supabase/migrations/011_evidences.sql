-- =====================================================================
-- Carbey Portal — オンボーディング再設計 フェーズ①: エビデンス管理
-- =====================================================================
-- クライアント要件（レビュー ⑨⑩）:
--   - 本人確認：顔写真付き身分証（免許/マイナンバー/パスポート）を提出・義務化
--   - 古物商許可証：取得猶予6ヶ月以内でデータ格納。未取得でもスタート可
--   - 本部が顧客ごとにエビデンスを管理（承認/却下）
--   - 加盟店はドラッグ&ドロップでアップロード、スマホでもDL可能
--
-- ファイル本体は private バケット member-evidences に保存し、
-- 表示/DLはサーバープロキシ（署名URLを露出しない）で行う。
-- 冪等化のため if exists / on conflict を併用。
-- =====================================================================

create table if not exists portal.evidences (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references portal.members(id) on delete cascade,
  -- 種別
  kind        text not null check (kind in ('identity', 'antique_license', 'other')),
  -- 身分証の種類（本人確認のとき。顔写真付きに限定）
  doc_type    text check (doc_type in ('license', 'mynumber', 'passport', 'antique', 'other')),
  -- ファイル
  storage_path text not null,
  file_name   text not null,
  file_type   text,
  file_size   int,
  -- 審査
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  note        text,          -- 本部メモ・却下理由
  created_at  timestamptz not null default now()
);

create index if not exists idx_evidences_member on portal.evidences(member_id);
create index if not exists idx_evidences_kind   on portal.evidences(member_id, kind);

-- ---------------------------------------------------------------------
-- Storage: private バケット member-evidences
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('member-evidences', 'member-evidences', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table portal.evidences enable row level security;

-- 閲覧: 本部スタッフは全件、加盟店は自分の分のみ
drop policy if exists portal_evidences_read on portal.evidences;
create policy portal_evidences_read on portal.evidences
  for select using (
    portal.is_staff(auth.uid())
    or member_id = portal.current_member_id(auth.uid())
  );

-- 追加（アップロード）: 加盟店は自分の member_id でのみ
drop policy if exists portal_evidences_member_insert on portal.evidences;
create policy portal_evidences_member_insert on portal.evidences
  for insert with check (
    member_id = portal.current_member_id(auth.uid())
  );

-- 削除: 加盟店は自分の pending のみ削除可（再提出のため）／本部は全件
drop policy if exists portal_evidences_delete on portal.evidences;
create policy portal_evidences_delete on portal.evidences
  for delete using (
    portal.is_staff(auth.uid())
    or (member_id = portal.current_member_id(auth.uid()) and status = 'pending')
  );

-- 更新（承認/却下）: 本部のみ
drop policy if exists portal_evidences_admin_update on portal.evidences;
create policy portal_evidences_admin_update on portal.evidences
  for update using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- GRANT（新規テーブル）
grant select, insert, delete on portal.evidences to authenticated;
grant update on portal.evidences to authenticated;
grant all on portal.evidences to service_role;

-- Storage の select ポリシー（認証ユーザー・実配信はサーバープロキシ経由）
drop policy if exists member_evidences_read on storage.objects;
create policy member_evidences_read on storage.objects
  for select using (bucket_id = 'member-evidences' and auth.uid() is not null);
