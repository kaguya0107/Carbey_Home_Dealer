-- 048: 会員のソフト削除（#11 会員削除の導線 ／ #16 登録削除）＋ 監査ログ
--
-- 方針：会員は物理削除せず deleted_at で無効化する。
--   ・入出金台帳・同意記録・オーダー等の関連データ（多くが on delete cascade）は保全され、
--     監査証跡が消えない（#11「重要データのセキュリティ＝保全」要件と整合）。
--   ・管理側の一覧・集計は deleted_at is null で除外する（アプリ側で対応）。
--   ・誤削除は「復元」で deleted_at を戻せる（可逆）。

-- 会員のソフト削除列
alter table portal.members add column if not exists deleted_at timestamptz;
alter table portal.members add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create index if not exists idx_members_deleted_at on portal.members(deleted_at);

comment on column portal.members.deleted_at is 'ソフト削除日時（NULL=有効）。物理削除せず一覧から除外する';
comment on column portal.members.deleted_by is 'ソフト削除を実行した本部ユーザー';

-- 監査ログ（会員削除・復元など重要操作の記録）
create table if not exists portal.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text,
  action       text not null,          -- 'member.delete' | 'member.restore' など
  target_type  text not null,          -- 'member'
  target_id    uuid,
  target_label text,                   -- 対象の表示名（会社名／氏名）
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_logs_created on portal.audit_logs(created_at desc);
create index if not exists idx_audit_logs_target on portal.audit_logs(target_type, target_id);

-- 監査ログは本部スタッフのみ閲覧可。書き込みは service_role（サーバー）経由のみ。
alter table portal.audit_logs enable row level security;
drop policy if exists portal_audit_staff_read on portal.audit_logs;
create policy portal_audit_staff_read on portal.audit_logs
  for select using (portal.is_staff(auth.uid()));
