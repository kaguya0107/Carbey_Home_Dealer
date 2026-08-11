-- =====================================================================
-- Carbey Portal — 自動判定タスクの本部による強制完了（テスト・例外運用）
-- =====================================================================
-- クライアントレビュー⑪-①（2026-07-15）:
--   「自動判定のタスクは本部管理画面からステータス変更ができない。
--     そのため途中のステップをスキップできず、自動売買・半自動売買のオンボーディング
--     フローを最後まで検証できない。自動判定タスクも管理者側から強制的に完了へ
--     変更できるようにしてほしい（テスト用でも可）」
--
--   これまで link_key 付きタスク（本人確認/資金/規約/マニュアル/契約/完了確認）は
--   実体だけが真実で、sync が常に上書きしていた（＝加盟店もボタンで飛ばせない）。
--   この方針は維持しつつ、本部が明示的に「上書き」した場合に限り sync の対象外にする。
--
--   admin_override = true のタスクは sync が触らない（本部が設定した状態を保持）。
--   本部が「自動判定に戻す」と false に戻り、次の sync で実体に再同期される。
--
--   ※ 加盟店側から上書きする手段は設けない（飛ばせない方針は維持）。
-- 冪等（if not exists / create or replace）。
-- =====================================================================

alter table portal.onboarding_tasks
  add column if not exists admin_override boolean not null default false;

comment on column portal.onboarding_tasks.admin_override is
  '本部が自動判定を上書きした（sync の対象外にする）。テスト・例外運用向け';

-- ---------------------------------------------------------------------
-- sync_onboarding_status：admin_override のタスクを除外して同期する
--   （ロジックは migration 020 と同一。除外条件のみ追加）
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
  --   ただし本部が上書きしたタスク（admin_override）は触らない
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
     and t.admin_override = false
     and t.status <> (case when v_ok then 'done' else 'todo' end);

  -- 全項目完了の確認：completion 以外の「必須(optional以外)」タスクが全 done か
  --   （上書きで done にしたタスクもここでは done として扱われる＝検証を最後まで通せる）
  select not exists (
    select 1 from portal.onboarding_tasks
     where member_id = p_member_id
       and optional = false
       and coalesce(link_key, '') <> 'completion'
       and status <> 'done'
  ) into v_completion_ok;

  -- 第2段：completion を反映（completion 自体が上書きされていれば触らない）
  update portal.onboarding_tasks t
     set status = case when v_completion_ok then 'done' else 'todo' end,
         completed_at = case when v_completion_ok then coalesce(t.completed_at, now()) else null end
   where t.member_id = p_member_id
     and t.link_key = 'completion'
     and t.admin_override = false
     and t.status <> (case when v_completion_ok then 'done' else 'todo' end);
end;
$$;
