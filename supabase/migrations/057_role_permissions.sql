-- Carbey Portal — 権限マトリクスの編集（本部が CRM入力担当・チャット専用の機能可否を自分で設定）
--
-- 背景（クライアント確定）：
--   権限マトリクスはこれまでコード固定（参照のみ）。本部が「CRM入力担当」「チャット専用」の
--   機能ごとの可否を、画面から自分で編集できるようにする。
--   ・管理者(admin)＝常に全権（締め出し防止のため編集対象外）。
--   ・加盟店(member)＝固定（編集対象外）。
--   ・編集は crm_staff / chat_only の2ロールのみ。機能ごとに「可／不可」。
--
--   本表は「上書き」。行が無い (role, feature) はコード既定（ACCESS_MATRIX）を使う。
create table if not exists portal.role_permissions (
  role       text not null check (role in ('crm_staff', 'chat_only')), -- 編集可能ロールのみ（DBレベルのガード）
  feature    text not null,                                            -- members/crm/plans/settings/reports/orders/chat/ai
  allowed    boolean not null,                                         -- true=可 / false=不可
  updated_at timestamptz not null default now(),
  primary key (role, feature)
);

comment on table portal.role_permissions is '権限マトリクスの上書き（CRM入力担当・チャット専用のみ・機能ごと可否）。行が無ければコード既定を使用。管理者は常に全権・加盟店は固定';

-- RLS：本部スタッフのみ閲覧。書き込みは service_role 経由（サーバー）。
alter table portal.role_permissions enable row level security;
drop policy if exists portal_role_perm_staff_read on portal.role_permissions;
create policy portal_role_perm_staff_read on portal.role_permissions
  for select using (portal.is_staff(auth.uid()));
