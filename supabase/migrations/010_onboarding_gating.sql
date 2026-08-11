-- =====================================================================
-- Carbey Portal — Phase 2 改修: フローチャート型・ゲート式オンボーディング
-- =====================================================================
-- クライアント要件:「加盟者が勝手に先行できない・飛ばせない・登録しないと開始できない」
--   - ステップ順厳守（前ステップ完了まで次ステップはロック）
--   - タスクは加盟店のアクションで自動完了（completion_type='auto'）
--   - 一部は本部承認（completion_type='manual'）
-- 冪等化のため if exists / or replace を併用。
-- =====================================================================

-- 完了方法の区分（auto=加盟店の操作で完了 / manual=本部承認で完了）
alter table portal.onboarding_tasks add column if not exists completion_type text not null default 'manual'
  check (completion_type in ('auto', 'manual'));

-- ステップの並び順（同一 step_key の最小 sort_order でステップ順を決める用）
-- 既存の sort_order を流用するため追加カラムは不要。

-- ---------------------------------------------------------------------
-- 既定タスク生成を「ゲート式」の定義に更新（completion_type つき）
-- 物販(eBay等)の具体項目は使わず、中古車FC向けの汎用ステップにする。
-- ---------------------------------------------------------------------
create or replace function portal.seed_onboarding_tasks(p_member_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
begin
  if exists (select 1 from portal.onboarding_tasks where member_id = p_member_id) then
    return;
  end if;

  insert into portal.onboarding_tasks (member_id, step_key, step_label, title, sort_order, completion_type) values
    -- STEP1 契約・初期設定
    (p_member_id, 'contract',  '契約・初期設定', '加盟契約の締結',                     10, 'manual'),
    (p_member_id, 'contract',  '契約・初期設定', 'アカウント発行・初回ログイン',       20, 'auto'),
    (p_member_id, 'contract',  '契約・初期設定', 'プロフィール（連絡先・陸送先）の登録', 30, 'auto'),
    -- STEP2 本人確認・必要書類
    (p_member_id, 'documents', '本人確認・必要書類', '本人確認書類の提出',             40, 'manual'),
    (p_member_id, 'documents', '本人確認・必要書類', '古物商許可証の提出',             50, 'manual'),
    (p_member_id, 'documents', '本人確認・必要書類', '販売店情報の登録',               60, 'auto'),
    -- STEP3 決済・資金
    (p_member_id, 'funding',   '決済・資金設定',   '決済情報（口座/カード）の登録',     70, 'auto'),
    (p_member_id, 'funding',   '決済・資金設定',   '利用規約への同意',                 80, 'auto'),
    -- STEP4 トレーニング（動画→確認）
    (p_member_id, 'training',  'トレーニング',     '市場分析マニュアルの視聴',         90, 'auto'),
    (p_member_id, 'training',  'トレーニング',     '仕入れ判断マニュアルの視聴',       100, 'auto'),
    (p_member_id, 'training',  'トレーニング',     '出品・販売ルールの確認',           110, 'auto'),
    -- STEP5 運用開始準備
    (p_member_id, 'launch',    '運用開始準備',     '初回オーダーの作成',               120, 'auto'),
    (p_member_id, 'launch',    '運用開始準備',     '全項目完了の確認',                 130, 'manual');
end;
$$;

-- ---------------------------------------------------------------------
-- 加盟店による自己完了（ゲート厳守）。
--   - completion_type='auto' のタスクのみ
--   - そのタスクが属するステップが「現在進行中（ロックされていない）」場合のみ
--   - 前ステップが未完了ならエラー（飛ばせない）
-- ---------------------------------------------------------------------
create or replace function portal.complete_own_task(p_user_id uuid, p_task_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_member uuid;
  v_task   record;
  v_prev_incomplete int;
begin
  -- 本人の member を特定
  select id into v_member from portal.members where user_id = p_user_id;
  if v_member is null then raise exception 'member not found'; end if;

  -- タスク取得（本人のものか・auto か）
  select * into v_task from portal.onboarding_tasks
   where id = p_task_id and member_id = v_member;
  if v_task is null then raise exception 'task not found'; end if;
  if v_task.completion_type <> 'auto' then raise exception 'このタスクは本部の確認が必要です'; end if;
  if v_task.status = 'done' then return; end if;

  -- ゲート判定: このタスクより前の sort_order のタスクに未完了があれば拒否（飛ばせない）
  select count(*) into v_prev_incomplete
    from portal.onboarding_tasks
   where member_id = v_member and sort_order < v_task.sort_order and status <> 'done';
  if v_prev_incomplete > 0 then
    raise exception '前のステップが未完了です。順番に進めてください。';
  end if;

  update portal.onboarding_tasks
     set status = 'done', completed_at = now()
   where id = p_task_id;
end;
$$;

create or replace function public.portal_complete_own_task(p_user_id uuid, p_task_id uuid)
returns void language sql security definer set search_path = public, portal as $$
  select portal.complete_own_task(p_user_id, p_task_id);
$$;

-- 既存メンバーのタスクに completion_type を後付け（前バージョンで生成済みのもの）
update portal.onboarding_tasks set completion_type = 'auto'
 where completion_type = 'manual'
   and title in ('アカウント発行・初回ログイン','プロフィール（連絡先・陸送先）の登録','販売店情報の登録',
                 '決済情報（口座/カード）の登録','利用規約への同意','市場の見方を学ぶ','AI壁打ちで候補整理を体験',
                 '出品ルールの確認','初回仕入れオーダー','初回出品');
