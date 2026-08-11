-- =====================================================================
-- Carbey Portal — レビュー⑯: 完全自動化（Phase 4）
-- =====================================================================
-- クライアント確定（2026-07-11）:
--   加盟店ごとに本部が手動でタスクを進める構造は運用が破綻する。すべて自動で流す。
--   本部の手動は「本人確認の承認」のみ。
--     - 加盟契約の締結   → members.contract_date が入っていれば自動 done（link_key='contract'）
--     - 全項目完了の確認 → 他の必須(optional以外)タスクが全 done なら自動 done（link_key='completion'）
--
-- 本 migration:
--   1) seed：契約締結・全項目確認を link_key 化（completion_type=auto）。
--   2) sync：contract / completion の自動判定を追加。completion は他必須が全 done かで決まるため
--      主判定の後に再計算する（2段更新）。
--   3) 既存タスクへ link_key を後付け（backfill）。
-- 冪等化のため or replace / if を併用。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) seed_onboarding_tasks：契約締結・全項目確認を自動判定型に
--    （フロー分岐は 019 を踏襲）
-- ---------------------------------------------------------------------
create or replace function portal.seed_onboarding_tasks(p_member_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_flow text;
begin
  if exists (select 1 from portal.onboarding_tasks where member_id = p_member_id) then
    return;
  end if;

  v_flow := portal.effective_flow(p_member_id);

  -- 共通ステップ（両フロー）。加盟契約の締結は link_key='contract'（contract_date で自動 done）。
  insert into portal.onboarding_tasks
    (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
    (p_member_id, 'contract',  '契約・初期設定',      '加盟契約の締結',                      10, 'auto',   'contract',        false),
    (p_member_id, 'contract',  '契約・初期設定',      'アカウント発行・初回ログイン',        20, 'auto',   null,              false),
    (p_member_id, 'contract',  '契約・初期設定',      'プロフィール（連絡先・陸送先）の登録',  30, 'auto',   null,              false),
    (p_member_id, 'documents', '本人確認・必要書類',  '本人確認書類の提出・承認',            40, 'manual', 'identity',        false),
    (p_member_id, 'documents', '本人確認・必要書類',  '古物商許可証の提出（6ヶ月以内）',      50, 'manual', 'antique_license', true),
    (p_member_id, 'funding',   '資金準備',            '資金準備（自己資金／資金調達）',        60, 'auto',   'funding',         false),
    (p_member_id, 'training',  '規約・実践マニュアル', '利用規約への同意',                    70, 'auto',   'terms',           false);

  if v_flow = 'auto' then
    insert into portal.onboarding_tasks
      (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
      (p_member_id, 'training', '規約・実践マニュアル', '実践マニュアル（自動売買）の修了', 80, 'auto', 'manual', false);
  else
    insert into portal.onboarding_tasks
      (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
      (p_member_id, 'training', '規約・実践マニュアル', '実践マニュアル（半自動売買）の修了', 80, 'auto', 'manual', false);
  end if;

  -- 運用開始準備。全項目完了の確認は link_key='completion'（他必須が全 done で自動）。
  insert into portal.onboarding_tasks
    (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
    (p_member_id, 'launch', '運用開始準備', '初回オーダーの作成', 90,  'auto', null,          false),
    (p_member_id, 'launch', '運用開始準備', '全項目完了の確認',  100,  'auto', 'completion',  false);
end;
$$;

-- ---------------------------------------------------------------------
-- 2) sync_onboarding_status：contract / completion の自動判定を追加
-- ---------------------------------------------------------------------
create or replace function portal.sync_onboarding_status(p_member_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_identity_ok  boolean;
  v_antique_ok   boolean;
  v_funding_ok   boolean;
  v_terms_ok     boolean;
  v_manual_ok    boolean;
  v_contract_ok  boolean;
  v_completion_ok boolean;
  v_flow         text;
  v_flows        text[];
begin
  v_flow := portal.effective_flow(p_member_id);
  v_flows := case when v_flow = 'auto' then array['auto','both'] else array['semi','both'] end;

  select exists (
    select 1 from portal.evidences
     where member_id = p_member_id and kind = 'identity' and status = 'approved'
  ) into v_identity_ok;

  select exists (
    select 1 from portal.evidences
     where member_id = p_member_id and kind = 'antique_license' and status = 'approved'
  ) into v_antique_ok;

  select exists (
    select 1 from portal.funding_applications
     where member_id = p_member_id and status = 'completed'
  ) into v_funding_ok;

  select exists (
    select 1
      from portal.agreements a
      join portal.agreement_consents c on c.agreement_id = a.id
     where a.published = true and c.member_id = p_member_id
  ) into v_terms_ok;

  select (
    (select count(*) from portal.manual_sections where published = true and flow = any(v_flows)) > 0
    and not exists (
      select 1 from portal.manual_sections s
       where s.published = true and s.flow = any(v_flows)
         and not exists (
           select 1 from portal.manual_progress p
            where p.section_id = s.id and p.member_id = p_member_id
         )
    )
  ) into v_manual_ok;

  -- 契約締結：契約日が入っていれば自動 done
  select exists (
    select 1 from portal.members where id = p_member_id and contract_date is not null
  ) into v_contract_ok;

  -- 第1段：link_key タスク（completion 以外）を実体に合わせる
  update portal.onboarding_tasks t
     set status = case when v_ok then 'done' else 'todo' end,
         completed_at = case when v_ok then coalesce(t.completed_at, now()) else null end
    from (values
      ('identity',        v_identity_ok),
      ('antique_license', v_antique_ok),
      ('funding',         v_funding_ok),
      ('terms',           v_terms_ok),
      ('manual',          v_manual_ok),
      ('contract',        v_contract_ok)
    ) as m(k, v_ok)
   where t.member_id = p_member_id
     and t.link_key = m.k
     and t.status <> (case when v_ok then 'done' else 'todo' end);

  -- 全項目完了の確認：completion 以外の「必須(optional以外)」タスクが全 done か
  select not exists (
    select 1 from portal.onboarding_tasks
     where member_id = p_member_id
       and optional = false
       and coalesce(link_key, '') <> 'completion'
       and status <> 'done'
  ) into v_completion_ok;

  -- 第2段：completion を反映
  update portal.onboarding_tasks t
     set status = case when v_completion_ok then 'done' else 'todo' end,
         completed_at = case when v_completion_ok then coalesce(t.completed_at, now()) else null end
   where t.member_id = p_member_id
     and t.link_key = 'completion'
     and t.status <> (case when v_completion_ok then 'done' else 'todo' end);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) 既存タスクへ link_key 後付け（前バージョンで生成済みのもの）
--    加盟契約の締結 → contract（completion_type も auto に）
--    全項目完了の確認 → completion（同上）
-- ---------------------------------------------------------------------
update portal.onboarding_tasks
   set link_key = 'contract', completion_type = 'auto'
 where link_key is null and title = '加盟契約の締結';

update portal.onboarding_tasks
   set link_key = 'completion', completion_type = 'auto'
 where link_key is null and title = '全項目完了の確認';
