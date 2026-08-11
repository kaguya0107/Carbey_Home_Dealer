-- =====================================================================
-- Carbey Portal — レビュー⑳基盤: プランの保有モデル + 加盟店の実行フロー
-- =====================================================================
-- クライアント確定（2026-07-11, docs/review-16-20-plan.md）:
--   - プランに「保有モデル」を持たせる：has_semi（半自動可）/ has_auto（自動可）。
--     フルオート = has_semi かつ has_auto（両方保有）／セミオート = has_semi のみ。
--   - 加盟店が「今実行しているフロー」を members.active_flow に持つ（'semi' | 'auto'）。
--     auto のみ保有→'auto' 固定、semi のみ→'semi' 固定、両方保有→既定 'auto' で手動 'semi' 切替可。
--
-- 本 migration はカラム追加と既存データのバックフィルのみ。フロー分岐の実装は次フェーズ。
-- 冪等化のため if not exists / on conflict を使用。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) plans: 保有モデルフラグ
-- ---------------------------------------------------------------------
alter table portal.plans add column if not exists has_semi boolean not null default true;   -- 半自動売買が可能か
alter table portal.plans add column if not exists has_auto boolean not null default false;  -- 自動売買が可能か

-- 既存プランを plan_type からバックフィル
--   semi_auto → 半自動のみ（has_semi=true, has_auto=false）
--   full_auto → 両方保有（has_semi=true, has_auto=true）
update portal.plans set has_semi = true,  has_auto = false where plan_type = 'semi_auto';
update portal.plans set has_semi = true,  has_auto = true  where plan_type = 'full_auto';

-- ---------------------------------------------------------------------
-- 2) members: 実行中フロー
--    null = 未設定（プランの保有モデルから既定を導出する。実装は次フェーズ）。
-- ---------------------------------------------------------------------
alter table portal.members
  add column if not exists active_flow text check (active_flow in ('semi', 'auto'));

comment on column portal.plans.has_semi is '半自動売買モデルを保有するプランか';
comment on column portal.plans.has_auto is '自動売買モデルを保有するプランか';
comment on column portal.members.active_flow is '加盟店が現在実行しているフロー（semi/auto）。null=プランから既定導出';
