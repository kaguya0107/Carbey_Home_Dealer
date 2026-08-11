-- =====================================================================
-- Carbey Portal — オンボーディング再設計 フェーズ⑤: フロー統合（自動同期）
-- =====================================================================
-- クライアント要件（⑨〜⑮ の統合）:
--   「加盟者が勝手に先行できない・飛ばせない・登録をしないと開始できない・自動化する」
--
-- これまで onboarding_tasks のゲートは各機能（本人確認/資金/規約/マニュアル）の
-- 実体と切り離されていた。本フェーズで両者を link_key で接続し、
-- 実体の状態からタスク完了を「自動判定」する（ボタンで勝手に消せない）。
--
--   link_key            自動完了条件
--   ------------------  --------------------------------------------------
--   identity            本人確認エビデンス(kind=identity)が approved
--   antique_license     古物商(kind=antique_license)が approved ※optional
--   funding             funding_applications.status = 'completed'
--   terms               有効な利用規約に同意済み
--   manual              公開マニュアルを全チェック
--
-- optional=true のタスク（古物商）は「未取得でもスタート可・6ヶ月猶予」のため
-- ステップ完了/機能解放の判定から除外する（⑨）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) カラム追加
-- ---------------------------------------------------------------------
alter table portal.onboarding_tasks
  add column if not exists link_key text;         -- 実体機能への接続キー（null=手動/従来）
alter table portal.onboarding_tasks
  add column if not exists optional boolean not null default false;  -- ゲート対象外（古物商など）

-- ---------------------------------------------------------------------
-- 2) 既定タスク生成を「実体連携」版に更新
--    物販(eBay等)の具体項目は使わず、中古車FC向けの汎用ステップ。
--    completion_type='auto' は加盟店操作 / 'manual' は本部承認。
--    link_key が付くタスクは sync により自動で done になる。
-- ---------------------------------------------------------------------
create or replace function portal.seed_onboarding_tasks(p_member_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
begin
  if exists (select 1 from portal.onboarding_tasks where member_id = p_member_id) then
    return;
  end if;

  insert into portal.onboarding_tasks
    (member_id, step_key, step_label, title, sort_order, completion_type, link_key, optional) values
    -- STEP1 契約・初期設定
    (p_member_id, 'contract',  '契約・初期設定',      '加盟契約の締結',                      10, 'manual', null,              false),
    (p_member_id, 'contract',  '契約・初期設定',      'アカウント発行・初回ログイン',        20, 'auto',   null,              false),
    (p_member_id, 'contract',  '契約・初期設定',      'プロフィール（連絡先・陸送先）の登録',  30, 'auto',   null,              false),
    -- STEP2 本人確認・必要書類（実体：evidences）
    (p_member_id, 'documents', '本人確認・必要書類',  '本人確認書類の提出・承認',            40, 'manual', 'identity',        false),
    (p_member_id, 'documents', '本人確認・必要書類',  '古物商許可証の提出（6ヶ月以内）',      50, 'manual', 'antique_license', true),
    -- STEP3 資金準備（実体：funding_applications）
    (p_member_id, 'funding',   '資金準備',            '資金準備（自己資金／資金調達）',        60, 'auto',   'funding',         false),
    -- STEP4 規約・トレーニング（実体：agreements / manual_sections）
    (p_member_id, 'training',  '規約・実践マニュアル', '利用規約への同意',                    70, 'auto',   'terms',           false),
    (p_member_id, 'training',  '規約・実践マニュアル', '実践マニュアルの修了',                80, 'auto',   'manual',          false),
    -- STEP5 運用開始準備
    (p_member_id, 'launch',    '運用開始準備',        '初回オーダーの作成',                  90, 'auto',   null,              false),
    (p_member_id, 'launch',    '運用開始準備',        '全項目完了の確認',                   100, 'manual', null,              false);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) 実体 → タスク状態の同期関数
--    各 link_key について、実体が満たされていれば done、そうでなければ todo に戻す。
--    link_key の無いタスク（従来の手動/自動）は触らない。
--    ボタンで勝手に done にできないよう、link_key タスクは常に実体に従う。
-- ---------------------------------------------------------------------
create or replace function portal.sync_onboarding_status(p_member_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_identity_ok  boolean;
  v_antique_ok   boolean;
  v_funding_ok   boolean;
  v_terms_ok     boolean;
  v_manual_ok    boolean;
begin
  -- 本人確認：kind=identity が approved で1件以上
  select exists (
    select 1 from portal.evidences
     where member_id = p_member_id and kind = 'identity' and status = 'approved'
  ) into v_identity_ok;

  -- 古物商：kind=antique_license が approved（optional）
  select exists (
    select 1 from portal.evidences
     where member_id = p_member_id and kind = 'antique_license' and status = 'approved'
  ) into v_antique_ok;

  -- 資金：funding_applications が completed
  select exists (
    select 1 from portal.funding_applications
     where member_id = p_member_id and status = 'completed'
  ) into v_funding_ok;

  -- 規約：有効（published）な規約に同意済み
  select exists (
    select 1
      from portal.agreements a
      join portal.agreement_consents c on c.agreement_id = a.id
     where a.published = true and c.member_id = p_member_id
  ) into v_terms_ok;

  -- マニュアル：公開セクションが1件以上あり、未チェックが無い
  select (
    (select count(*) from portal.manual_sections where published = true) > 0
    and not exists (
      select 1 from portal.manual_sections s
       where s.published = true
         and not exists (
           select 1 from portal.manual_progress p
            where p.section_id = s.id and p.member_id = p_member_id
         )
    )
  ) into v_manual_ok;

  -- 反映（done/todo を実体に合わせる。手動 in_progress は保持しない＝実体が唯一の真実）
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

-- public ラッパー（RPC 用）
create or replace function public.portal_sync_onboarding_status(p_member_id uuid)
returns void language sql security definer set search_path = public, portal as $$
  select portal.sync_onboarding_status(p_member_id);
$$;

-- ---------------------------------------------------------------------
-- 4) ゲート判定から optional タスクを除外（古物商が未提出でも前に進める）
--    complete_own_task の「前ステップ未完了」判定で optional を無視する。
-- ---------------------------------------------------------------------
create or replace function portal.complete_own_task(p_user_id uuid, p_task_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_member uuid;
  v_task   record;
  v_prev_incomplete int;
begin
  select id into v_member from portal.members where user_id = p_user_id;
  if v_member is null then raise exception 'member not found'; end if;

  select * into v_task from portal.onboarding_tasks
   where id = p_task_id and member_id = v_member;
  if v_task is null then raise exception 'task not found'; end if;
  if v_task.completion_type <> 'auto' then raise exception 'このタスクは本部の確認が必要です'; end if;
  -- link_key 付きは実体でしか完了できない（ボタンでの直接完了を禁止）
  if v_task.link_key is not null then
    raise exception 'このタスクは対応する手続きの完了で自動的に達成されます';
  end if;
  if v_task.status = 'done' then return; end if;

  -- ゲート判定: このタスクより前で「optional でない」未完了があれば拒否（飛ばせない）
  select count(*) into v_prev_incomplete
    from portal.onboarding_tasks
   where member_id = v_member and sort_order < v_task.sort_order
     and optional = false and status <> 'done';
  if v_prev_incomplete > 0 then
    raise exception '前のステップが未完了です。順番に進めてください。';
  end if;

  update portal.onboarding_tasks
     set status = 'done', completed_at = now()
   where id = p_task_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) 既存メンバーのタスクへ link_key / optional / step_label を後付け
--    （前バージョンの seed で生成済みのタスクを新方式に合わせる）
-- ---------------------------------------------------------------------
update portal.onboarding_tasks set link_key = 'identity'
 where link_key is null and title in ('本人確認書類の提出','本人確認書類の提出・承認');
update portal.onboarding_tasks set link_key = 'antique_license', optional = true
 where link_key is null and title in ('古物商許可証の提出','古物商許可証の提出（6ヶ月以内）');
update portal.onboarding_tasks set link_key = 'terms'
 where link_key is null and title = '利用規約への同意';

grant execute on function public.portal_sync_onboarding_status(uuid) to authenticated, service_role;
