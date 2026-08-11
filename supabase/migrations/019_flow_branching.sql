-- =====================================================================
-- Carbey Portal — レビュー⑰⑳: フロー二系統化（Phase 3-a）
-- =====================================================================
-- クライアント確定（2026-07-11）:
--   - 自動売買 / 半自動売買 でマニュアル（フロー）が別スキーム。
--   - 資金調達分岐（自己資金/資金調達）は両フロー共通。
--   - 自動売買フローの中身は後でクライアント提供 → 器を先に作り CMS で埋める（空プレースホルダで開始）。
--   - フルオート = has_semi かつ has_auto／セミオート = has_semi のみ。
--     実効フロー：両方保有→既定 auto、semi のみ→semi、未割当→semi（安全側）。
--
-- 本 migration（3-a）:
--   1) manual_sections に flow 列（'semi' | 'auto' | 'both'）。既存8項目は半自動用→'semi'。
--   2) seed_onboarding_tasks を実効フローで分岐（共通＋フロー別マニュアル＋auto空プレースホルダ）。
--   3) sync_onboarding_status のマニュアル判定を「その加盟店の実効フローに該当する公開セクション」に限定。
-- 冪等化のため if exists / or replace を併用。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) manual_sections.flow
-- ---------------------------------------------------------------------
alter table portal.manual_sections
  add column if not exists flow text not null default 'semi'
  check (flow in ('semi', 'auto', 'both'));

-- 既存の実践マニュアル項目は「半自動用」なので semi（default で既に semi だが明示）。
update portal.manual_sections set flow = 'semi' where flow is null;

comment on column portal.manual_sections.flow is 'このマニュアル項目が属するフロー種別（semi/auto/both）';

-- ---------------------------------------------------------------------
-- ヘルパー：加盟店の実効フローを返す（プランの保有モデル＋active_flow から導出）
--   両方保有→ active_flow を尊重（既定 auto）／semi のみ→semi／auto のみ→auto／未割当→semi
-- ---------------------------------------------------------------------
create or replace function portal.effective_flow(p_member_id uuid)
returns text language plpgsql stable security definer set search_path = portal as $$
declare
  v_active   text;
  v_has_semi boolean;
  v_has_auto boolean;
begin
  select m.active_flow, coalesce(pl.has_semi, false), coalesce(pl.has_auto, false)
    into v_active, v_has_semi, v_has_auto
    from portal.members m
    left join portal.plans pl on pl.id = m.plan_id
   where m.id = p_member_id;

  -- 明示設定が保有モデルと整合していれば尊重
  if v_active = 'auto' and v_has_auto then return 'auto'; end if;
  if v_active = 'semi' and v_has_semi then return 'semi'; end if;
  -- 既定導出
  if v_has_auto then return 'auto'; end if;
  if v_has_semi then return 'semi'; end if;
  return 'semi';
end;
$$;

-- ---------------------------------------------------------------------
-- 2) seed_onboarding_tasks：実効フローで分岐生成
--    共通（契約/本人確認/資金/規約）＋ フロー別マニュアル ＋ auto は空プレースホルダ追加。
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

  -- 共通ステップ（両フロー）
  insert into portal.onboarding_tasks
    (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
    (p_member_id, 'contract',  '契約・初期設定',      '加盟契約の締結',                      10, 'manual', null,              false),
    (p_member_id, 'contract',  '契約・初期設定',      'アカウント発行・初回ログイン',        20, 'auto',   null,              false),
    (p_member_id, 'contract',  '契約・初期設定',      'プロフィール（連絡先・陸送先）の登録',  30, 'auto',   null,              false),
    (p_member_id, 'documents', '本人確認・必要書類',  '本人確認書類の提出・承認',            40, 'manual', 'identity',        false),
    (p_member_id, 'documents', '本人確認・必要書類',  '古物商許可証の提出（6ヶ月以内）',      50, 'manual', 'antique_license', true),
    (p_member_id, 'funding',   '資金準備',            '資金準備（自己資金／資金調達）',        60, 'auto',   'funding',         false),
    (p_member_id, 'training',  '規約・実践マニュアル', '利用規約への同意',                    70, 'auto',   'terms',           false);

  -- フロー別の実践マニュアル修了（link_key='manual' は sync がフローに応じて判定）
  if v_flow = 'auto' then
    insert into portal.onboarding_tasks
      (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
      (p_member_id, 'training', '規約・実践マニュアル', '実践マニュアル（自動売買）の修了', 80, 'auto', 'manual', false);
  else
    insert into portal.onboarding_tasks
      (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
      (p_member_id, 'training', '規約・実践マニュアル', '実践マニュアル（半自動売買）の修了', 80, 'auto', 'manual', false);
  end if;

  -- 運用開始準備（共通）
  insert into portal.onboarding_tasks
    (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
    (p_member_id, 'launch', '運用開始準備', '初回オーダーの作成',   90, 'auto',   null, false),
    (p_member_id, 'launch', '運用開始準備', '全項目完了の確認',    100, 'manual', null, false);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) sync_onboarding_status：マニュアル判定を実効フローに限定
--    semi の加盟店 → flow in ('semi','both') の公開セクションで全チェック判定。
--    auto の加盟店 → flow in ('auto','both')。該当セクションが0件なら未修了扱い（false）。
-- ---------------------------------------------------------------------
create or replace function portal.sync_onboarding_status(p_member_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_identity_ok  boolean;
  v_antique_ok   boolean;
  v_funding_ok   boolean;
  v_terms_ok     boolean;
  v_manual_ok    boolean;
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

  -- マニュアル：実効フローに該当する公開セクションが1件以上あり、未チェックが無い
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

  update portal.onboarding_tasks t
     set status = case when v_ok then 'done' else 'todo' end,
         completed_at = case when v_ok then coalesce(t.completed_at, now()) else null end
    from (values
      ('identity',        v_identity_ok),
      ('antique_license', v_antique_ok),
      ('funding',         v_funding_ok),
      ('terms',           v_terms_ok),
      ('manual',          v_manual_ok)
    ) as m(k, v_ok)
   where t.member_id = p_member_id
     and t.link_key = m.k
     and t.status <> (case when v_ok then 'done' else 'todo' end);
end;
$$;
