-- =====================================================================
-- Carbey Portal — 運用方式（セミオート/フルオート）の権限を会員ごとに個別設定
-- =====================================================================
-- クライアントレビュー④（2026-07-15）:
--   「セミオートと、それ以外のプランで運用方式が異なるので、プルダウン設定に入れずに
--     別設定できるようにしてください。フルオートとセミオートは権限を割り当てたら
--     両方利用できる仕様で。セミオート権限＋フルオート権限＋両方もってる権限です」
--
--   これまで運用方式は plans.has_semi / has_auto（＝プランのプルダウン）に従属していた。
--   本migrationで members に権限を持たせ、プラン選択から独立して割り当てられるようにする。
--     grant_semi = true → 半自動売買（セミオート）を利用可
--     grant_auto = true → 自動売買（フルオート）を利用可
--     両方 true        → 両方利用可＋フロー切替可
--   プランの has_semi / has_auto は「新規割当時の既定値」として引き続き利用する。
--
-- レビュー⑥（規約更新→未同意→機能制限）:
--   規約を新版で公開すると、旧版への同意は無効になり terms タスクは todo に戻るべきだが、
--   sync は「その加盟店の画面を開いたとき」しか走らず、本部側の表示が古いままだった。
--   全加盟店を一括同期する関数を追加し、規約の公開時に呼べるようにする。
-- 冪等化のため if not exists を併用。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 会員ごとの運用方式の権限
-- ---------------------------------------------------------------------
alter table portal.members add column if not exists grant_semi boolean not null default true;   -- セミオート権限
alter table portal.members add column if not exists grant_auto boolean not null default false;  -- フルオート権限

comment on column portal.members.grant_semi is '半自動売買（セミオート）の利用権限。プランとは独立して本部が割り当てる';
comment on column portal.members.grant_auto is '自動売買（フルオート）の利用権限。プランとは独立して本部が割り当てる';

-- 既存会員の権限を、現在のプランの保有モデルから引き継ぐ（初期値の整合）
update portal.members m
   set grant_semi = coalesce(p.has_semi, true),
       grant_auto = coalesce(p.has_auto, false)
  from portal.plans p
 where m.plan_id = p.id;

-- ---------------------------------------------------------------------
-- 2) 全加盟店のオンボーディング状態を一括同期（規約の新版公開時などに使用）
--    既存の portal.sync_onboarding_status(member) を全会員に対して回す。
-- ---------------------------------------------------------------------
create or replace function portal.sync_all_onboarding_status()
returns void language plpgsql security definer set search_path = portal as $$
declare
  r record;
begin
  for r in select id from portal.members loop
    perform portal.sync_onboarding_status(r.id);
  end loop;
end;
$$;

-- public ラッパー（RPC 用）
create or replace function public.portal_sync_all_onboarding_status()
returns void language sql security definer set search_path = public, portal as $$
  select portal.sync_all_onboarding_status();
$$;

grant execute on function public.portal_sync_all_onboarding_status() to authenticated, service_role;
