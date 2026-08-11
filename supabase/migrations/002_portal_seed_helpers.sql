-- =====================================================================
-- Carbey Portal — Phase 1: ブートストラップ用ヘルパー (要求書準拠版)
-- =====================================================================
-- auth.users に存在する user_id を portal.users に登録する。
-- public ラッパーも用意し、portal スキーマ未公開でも RPC で呼べるようにする。
-- ロール: admin / member / crm_staff / chat_only
-- =====================================================================

-- 過去バージョンの関数を掃除する (引数シグネチャ違いで複数残っていると
-- "function name is not unique" になるため、考えられる全シグネチャを明示 drop)。
drop function if exists public.portal_bootstrap_admin(uuid, text);
drop function if exists public.portal_bootstrap_admin(uuid, text, text);
drop function if exists public.portal_bootstrap_super_admin(uuid, text);
drop function if exists public.portal_bootstrap_super_admin(uuid, text, text);
drop function if exists portal.bootstrap_admin(uuid, text);
drop function if exists portal.bootstrap_admin(uuid, text, text);
drop function if exists portal.bootstrap_super_admin(uuid, text);
drop function if exists portal.bootstrap_super_admin(uuid, text, text);
drop function if exists portal.attach_user(uuid, text, text);
drop function if exists portal.attach_user(uuid, text, text, text);
drop function if exists portal.attach_franchise_user(uuid, uuid, text, text);

-- 管理者(本部)を登録/昇格
create or replace function portal.bootstrap_admin(p_user_id uuid, p_name text default null, p_email text default null)
returns void language plpgsql security definer set search_path = portal as $$
begin
  insert into portal.users (id, name, email, role)
  values (p_user_id, p_name, p_email, 'admin')
  on conflict (id) do update
    set role = 'admin',
        name = coalesce(excluded.name, portal.users.name),
        email = coalesce(excluded.email, portal.users.email);
end;
$$;

comment on function portal.bootstrap_admin is
  '最初の管理者(本部)を登録/昇格する。auth.users に存在する user_id を渡す。';

-- public ラッパー (PostgREST は public のみ公開のため)
create or replace function public.portal_bootstrap_admin(p_user_id uuid, p_name text default null, p_email text default null)
returns void language sql security definer set search_path = public, portal as $$
  select portal.bootstrap_admin(p_user_id, p_name, p_email);
$$;

comment on function public.portal_bootstrap_admin is
  'portal.bootstrap_admin の public ラッパー。スキーマ未公開でも RPC 呼び出し可能にするため。';

-- 任意ロールのユーザーを登録 (member / crm_staff / chat_only)
create or replace function portal.attach_user(p_user_id uuid, p_role text, p_name text default null, p_email text default null)
returns void language plpgsql security definer set search_path = portal as $$
begin
  if p_role not in ('admin', 'member', 'crm_staff', 'chat_only') then
    raise exception 'invalid role: %', p_role;
  end if;
  insert into portal.users (id, name, email, role)
  values (p_user_id, p_name, p_email, p_role)
  on conflict (id) do update
    set role = excluded.role,
        name = coalesce(excluded.name, portal.users.name),
        email = coalesce(excluded.email, portal.users.email);
end;
$$;

comment on function portal.attach_user is
  '作成済み auth ユーザーを portal.users に登録する (admin/member/crm_staff/chat_only)。';
