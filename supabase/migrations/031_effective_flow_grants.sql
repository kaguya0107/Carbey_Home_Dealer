-- =====================================================================
-- Carbey Portal — effective_flow を「会員ごとの運用権限」ベースに統一
-- =====================================================================
-- 背景（レビュー④の続き）:
--   migration 030 で運用方式（セミオート/フルオート）を members.grant_semi / grant_auto に
--   移したが、SQL 側のヘルパー portal.effective_flow()（migration 019）は
--   plans.has_semi / has_auto を参照したままだった。
--   その結果「アプリの表示は権限ベース／DBの同期処理はプランベース」と真実が二重化し、
--   実践マニュアルの修了判定（sync_onboarding_status）が実際の権限と食い違う。
--
--   本migrationで effective_flow を grants ベースに統一する。
--   ロジックは lib/portal/flow.ts の resolveFlow と同一：
--     active_flow が権限と整合すれば尊重 → 両方保有なら auto → auto のみ auto →
--     semi のみ semi → 権限なしは semi（安全側）
--
--   これにより sync_onboarding_status のマニュアル判定も権限ベースになり、
--   本部画面の表示と DB の判定が一致する。
-- =====================================================================

create or replace function portal.effective_flow(p_member_id uuid)
returns text language plpgsql stable security definer set search_path = portal as $$
declare
  v_active   text;
  v_has_semi boolean;
  v_has_auto boolean;
begin
  -- ④ プランではなく、会員ごとに割り当てた運用権限を参照する
  select m.active_flow, coalesce(m.grant_semi, false), coalesce(m.grant_auto, false)
    into v_active, v_has_semi, v_has_auto
    from portal.members m
   where m.id = p_member_id;

  -- 明示設定が保有権限と整合していれば尊重
  if v_active = 'auto' and v_has_auto then return 'auto'; end if;
  if v_active = 'semi' and v_has_semi then return 'semi'; end if;
  -- 既定導出
  if v_has_auto then return 'auto'; end if;
  if v_has_semi then return 'semi'; end if;
  return 'semi';
end;
$$;
