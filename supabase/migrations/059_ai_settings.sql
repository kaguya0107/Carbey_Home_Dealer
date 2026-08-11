-- Carbey Portal — Phase 4 AI: プラン・会員のAI設定
--
-- 背景（要件確定）：
--   AI機能（加盟店AI／本部AI）の使用量・モデル階層・任意拡張を、プラン既定＋会員上書きで制御する。
--   ・plans にAIの既定値（月の検索割当・回答グレード・繰越・任意拡張トグル）。
--   ・members に上書き（null=プラン既定を継承）。
--   feature_ai（サイドバー表示可否・migration 050）は既存。ここに使用量・階層・機能の設定を足す。
--
--   詳細は docs/phase4-ai-implementation-plan.md（Step 1）。

alter table portal.plans
  add column if not exists ai_monthly_searches integer not null default 0,
  add column if not exists ai_model_tier       text    not null default 'standard' check (ai_model_tier in ('light','standard','premium')),
  add column if not exists ai_carry_over        boolean not null default true,
  add column if not exists ai_image_enabled     boolean not null default false,
  add column if not exists ai_docgen_enabled    boolean not null default false,
  add column if not exists ai_deep_enabled      boolean not null default false;

comment on column portal.plans.ai_monthly_searches is 'プラン既定：AIの月間検索割当回数（1検索=AI回答1回）';
comment on column portal.plans.ai_model_tier is 'プラン既定：回答グレード light/standard/premium';
comment on column portal.plans.ai_carry_over is 'プラン既定：未消化分を翌月へ繰越するか';

-- 会員上書き（null=プラン既定を継承）
alter table portal.members
  add column if not exists ai_monthly_searches integer,
  add column if not exists ai_model_tier       text check (ai_model_tier in ('light','standard','premium')),
  add column if not exists ai_carry_over        boolean,
  add column if not exists ai_image_enabled     boolean,
  add column if not exists ai_docgen_enabled    boolean,
  add column if not exists ai_deep_enabled      boolean;

comment on column portal.members.ai_monthly_searches is '会員上書き：AIの月間検索割当（null=プラン既定）';
