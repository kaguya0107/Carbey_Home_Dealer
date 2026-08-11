-- Carbey Portal — Phase 4 AI: 使用量メータリング（1検索=¥10・月割当・繰越）と保存検索
--
-- 背景（要件確定）：
--   ・ai_usage_ledger … 追記専用の利用台帳（search/画像/書面生成/ディープ）。原価集計・監視の源泉。
--   ・ai_usage_month  … 月次カウンタ（割当・繰越・消費）。検索の残数判定と繰越に使う。
--   ・ai_saved_searches … 共通のカーセンサー市場データの上に載る、加盟者ごとの「検索・蓄積」ストア。
--   検索1回の消費は原子的関数 ai_reserve_search で行う（成功後に呼ぶ。残数不足なら例外）。
--   allocated/carried_in はアプリ側で実効値を算出して渡す（プラン既定×会員上書き×前月繰越）。

create table if not exists portal.ai_usage_ledger (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid references portal.members(id) on delete set null,  -- hq は null
  scope           text not null check (scope in ('member','hq')),
  kind            text not null check (kind in ('search','image','docgen','deep')),
  model_tier      text,
  unit_cost_yen   integer,
  input_tokens    integer,
  output_tokens   integer,
  conversation_id uuid references portal.ai_conversations(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ai_ledger_member_ts on portal.ai_usage_ledger(member_id, created_at);

create table if not exists portal.ai_usage_month (
  member_id  uuid not null references portal.members(id) on delete cascade,
  ym         text not null,                 -- 'YYYY-MM'（Asia/Tokyo）
  allocated  integer not null default 0,
  carried_in integer not null default 0,
  used       integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (member_id, ym)
);

create table if not exists portal.ai_saved_searches (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references portal.members(id) on delete cascade,
  query      text,
  params     jsonb,
  result_ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_saved_member on portal.ai_saved_searches(member_id, created_at);

-- 検索1回の原子的消費。残数不足なら AI_QUOTA_EXCEEDED を raise。消費後の残数を返す。
create or replace function portal.ai_reserve_search(
  p_member uuid, p_ym text, p_allocated integer, p_carried_in integer
) returns integer
language plpgsql
as $$
declare v_remaining integer;
begin
  insert into portal.ai_usage_month(member_id, ym, allocated, carried_in, used)
  values (p_member, p_ym, p_allocated, p_carried_in, 0)
  on conflict (member_id, ym)
    do update set allocated = excluded.allocated, carried_in = excluded.carried_in, updated_at = now();

  update portal.ai_usage_month
     set used = used + 1, updated_at = now()
   where member_id = p_member and ym = p_ym and used < allocated + carried_in
   returning allocated + carried_in - used into v_remaining;

  if not found then
    raise exception 'AI_QUOTA_EXCEEDED';
  end if;
  return v_remaining;
end;
$$;

-- RLS：加盟店は自分の行のみ、本部スタッフは全件。
alter table portal.ai_usage_ledger enable row level security;
drop policy if exists ai_ledger_read on portal.ai_usage_ledger;
create policy ai_ledger_read on portal.ai_usage_ledger
  for select using (portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid()));

alter table portal.ai_usage_month enable row level security;
drop policy if exists ai_month_read on portal.ai_usage_month;
create policy ai_month_read on portal.ai_usage_month
  for select using (portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid()));

alter table portal.ai_saved_searches enable row level security;
drop policy if exists ai_saved_read on portal.ai_saved_searches;
create policy ai_saved_read on portal.ai_saved_searches
  for select using (portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid()));
