-- =====================================================================
-- Carbey Portal — Phase 1: システム基盤構築 (要求事項定義書 v1.2 準拠)
-- =====================================================================
-- 設計方針 (docs/architecture.md 参照):
--   - 既存 Carbey と同じ Supabase プロジェクトに「相乗り」。新システムは専用スキーマ portal。
--   - 認証は auth.users を共有。新システムのユーザー属性は portal.users で管理 (論点Y)。
--   - tenant 分離キーは member_id / user_id。RLS でロール別アクセス制御 (論点A)。
--
-- 要求書 5.1 権限区分: 管理者 / 加盟店 / CRM入力担当 / チャット専用
--   admin     = 管理者(本部) 全権
--   member    = 加盟店
--   crm_staff = CRM入力担当 (内部スタッフ。CRM/会員のみ)
--   chat_only = チャット専用 (内部スタッフ。チャットのみ)
-- 要求書 4 プラン: home_dealer / economy / bronze / platinum / gold
-- 要求書 5.2 契約ステータス: active(有効) / suspended(停止) / cancelled(解約) + pending(申込中)
--
-- 全文を再実行可能。 既存の portal スキーマがあれば drop して作り直す。
-- =====================================================================

drop schema if exists portal cascade;
create schema portal;

grant usage on schema portal to anon, authenticated, service_role;

create or replace function portal.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- plans — プランマスタ (要求書 4 / 5.x プラン管理)
--   表示順: エコノミー → ブロンズ → プラチナ → ゴールド (要求書 4.2)
-- ---------------------------------------------------------------------
create table portal.plans (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,                  -- 'home_dealer'|'economy'|'bronze'|'platinum'|'gold'
  name          text not null,
  plan_type     text not null check (plan_type in ('semi_auto', 'full_auto')),
  monthly_fee_yen integer not null default 0,
  joining_fee_yen integer not null default 0,
  display_order int not null default 0,
  description   text,
  features      jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_portal_plans_order on portal.plans(display_order);

create trigger trg_portal_plans_touch
  before update on portal.plans
  for each row execute function portal.touch_updated_at();

-- 要求書 4.2 準拠: 半自動(ホームディーラー) + 全自動4ランク(エコノミー/ブロンズ/プラチナ/ゴールド)
insert into portal.plans (code, name, plan_type, monthly_fee_yen, joining_fee_yen, display_order, description) values
  ('home_dealer', 'セミオート', 'semi_auto', 10000, 0, 0, '加盟者自身が車両選定・仕入れ判断・販売活動を主体的に行う半自動プラン（セミオート）'),
  ('economy',     'エコノミー', 'full_auto', 10000, 0, 1, 'エントリー最下位モデル。全自動プランの入門ランク'),
  ('bronze',      'ブロンズ',   'full_auto', 20000, 0, 2, '中位プラン。料金設定で優位性ありの最安値帯。自動売買機能に一部制限あり'),
  ('platinum',    'プラチナ',   'full_auto', 30000, 0, 3, '上位プラン。料金設定で優位性あり'),
  ('gold',        'ゴールド',   'full_auto', 50000, 0, 4, '最上位プラン。料金設定で優位性あり');

-- ---------------------------------------------------------------------
-- users — 新システムのユーザー属性 (auth.users と id で 1:1)
--   要求書 5.1: 管理者 / 加盟店 / CRM入力担当 / チャット専用
-- ---------------------------------------------------------------------
create table portal.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  email       text,
  role        text not null check (role in ('admin', 'member', 'crm_staff', 'chat_only')),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_portal_users_role on portal.users(role);

create trigger trg_portal_users_touch
  before update on portal.users
  for each row execute function portal.touch_updated_at();

-- ---------------------------------------------------------------------
-- members — 加盟店の業務情報 (要求書 5.2 登録・管理項目)
-- ---------------------------------------------------------------------
create table portal.members (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  -- 基本情報 (要求書 5.2)
  company_name    text,
  member_name     text not null,                         -- 氏名
  phone_mobile    text,                                  -- 連絡先携帯番号
  phone_landline  text,                                  -- 固定電話番号
  email           text,
  address         text,                                  -- 住所
  -- 陸送先 (要求書 5.2)
  delivery_name   text,                                  -- 陸送先名
  delivery_address text,                                 -- 陸送先住所
  delivery_contact text,                                 -- 陸送先連絡先
  -- 契約情報 (要求書 5.2)
  plan_id         uuid references portal.plans(id),
  contract_date   date,                                  -- 契約日
  status          text not null default 'pending'
                    check (status in ('pending', 'active', 'suspended', 'cancelled')),  -- 有効/停止/解約
  -- 財務情報 (要求書 5.2)
  joining_fee_yen integer,                               -- 加盟金
  monthly_fee_yen integer,                               -- 月額費用
  working_capital_yen integer,                           -- 運転資金
  payment_status  text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'paid', 'overdue')),
  -- 利用状況 (要求書 5.2)
  registration_date date not null default current_date,
  last_login_at   timestamptz,                           -- ログイン履歴
  -- オンボーディング進捗 (Phase 2 本体実装。ここでは完了ステップ数のみ)
  onboarding_total int not null default 8,
  onboarding_done  int not null default 0,
  -- 管理者内部メモ
  admin_notes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_portal_members_status on portal.members(status);
create index idx_portal_members_plan   on portal.members(plan_id);
create index idx_portal_members_user   on portal.members(user_id);

create trigger trg_portal_members_touch
  before update on portal.members
  for each row execute function portal.touch_updated_at();

-- ---------------------------------------------------------------------
-- payments — 入金履歴 (要求書 5.2 財務情報)
-- ---------------------------------------------------------------------
create table portal.payments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references portal.members(id) on delete cascade,
  amount_yen   integer not null,
  payment_date date not null default current_date,
  kind         text not null default 'monthly' check (kind in ('joining', 'monthly', 'other')),
  status       text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  note         text,
  created_at   timestamptz not null default now()
);

create index idx_portal_payments_member on portal.payments(member_id);
create index idx_portal_payments_date   on portal.payments(payment_date);

-- ---------------------------------------------------------------------
-- CRM (要求書 5.12) — 本部側でエンドユーザー(購入者)・商談情報を管理
--   将来の外部CRML連携・加盟店側拡張を見据え franchise(member)_id でモジュール化
-- ---------------------------------------------------------------------
create table portal.crm_customers (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid references portal.members(id) on delete set null,  -- 担当加盟店 (本部直管理は null)
  name         text not null,                           -- エンドユーザー(購入者)氏名
  phone        text,
  email        text,
  address      text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_portal_crm_customers_member on portal.crm_customers(member_id);

create trigger trg_portal_crm_customers_touch
  before update on portal.crm_customers
  for each row execute function portal.touch_updated_at();

-- 購入履歴 (要求書 5.12 顧客管理: 基本情報・購入履歴)
create table portal.crm_purchases (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references portal.crm_customers(id) on delete cascade,
  vehicle_name text,                                     -- 購入車両
  price_yen    integer,
  purchased_at date,
  note         text,
  created_at   timestamptz not null default now()
);

create index idx_portal_crm_purchases_customer on portal.crm_purchases(customer_id);

-- 商談管理 (要求書 5.12: 商談ステータス・進捗・対応履歴の記録)
create table portal.crm_deals (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references portal.crm_customers(id) on delete cascade,
  title        text,
  status       text not null default 'lead'
                 check (status in ('lead', 'negotiating', 'quoted', 'won', 'lost')),
  amount_yen   integer,
  assigned_to  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_portal_crm_deals_customer on portal.crm_deals(customer_id);
create index idx_portal_crm_deals_status   on portal.crm_deals(status);

create trigger trg_portal_crm_deals_touch
  before update on portal.crm_deals
  for each row execute function portal.touch_updated_at();

-- 商談の対応履歴
create table portal.crm_deal_notes (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references portal.crm_deals(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index idx_portal_crm_deal_notes_deal on portal.crm_deal_notes(deal_id);

-- ---------------------------------------------------------------------
-- notifications — 通知 (新規会員登録・入金確認・オーダー・チャット等)
-- ---------------------------------------------------------------------
create table portal.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,  -- 宛先 (null = admin宛て)
  audience    text not null default 'user' check (audience in ('user', 'admin')),
  kind        text not null default 'info',
  title       text not null,
  message     text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_portal_notifications_user on portal.notifications(user_id, is_read);
create index idx_portal_notifications_audience on portal.notifications(audience, is_read);

-- =====================================================================
-- RLS ヘルパー関数
-- =====================================================================

-- 管理者(本部)か?
create or replace function portal.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = portal as $$
  select exists (select 1 from portal.users u where u.id = uid and u.role = 'admin');
$$;

-- 本部スタッフ(管理者/CRM入力担当/チャット専用)か? = member 以外
create or replace function portal.is_staff(uid uuid)
returns boolean language sql stable security definer set search_path = portal as $$
  select exists (select 1 from portal.users u where u.id = uid and u.role in ('admin', 'crm_staff', 'chat_only'));
$$;

-- CRM にアクセスできるか? (管理者 or CRM入力担当)
create or replace function portal.can_crm(uid uuid)
returns boolean language sql stable security definer set search_path = portal as $$
  select exists (select 1 from portal.users u where u.id = uid and u.role in ('admin', 'crm_staff'));
$$;

-- uid が紐付く member.id (加盟店本人のみ)
create or replace function portal.current_member_id(uid uuid)
returns uuid language sql stable security definer set search_path = portal as $$
  select m.id from portal.members m where m.user_id = uid;
$$;

-- =====================================================================
-- RLS ポリシー (要求書 5.1 権限に応じた機能制限)
-- =====================================================================
alter table portal.plans          enable row level security;
alter table portal.users          enable row level security;
alter table portal.members        enable row level security;
alter table portal.payments       enable row level security;
alter table portal.crm_customers  enable row level security;
alter table portal.crm_purchases  enable row level security;
alter table portal.crm_deals      enable row level security;
alter table portal.crm_deal_notes enable row level security;
alter table portal.notifications  enable row level security;

-- plans: 認証ユーザー閲覧可 / 書き込みは admin
create policy portal_plans_read on portal.plans
  for select using (auth.uid() is not null);
create policy portal_plans_admin_write on portal.plans
  for all using (portal.is_admin(auth.uid())) with check (portal.is_admin(auth.uid()));

-- users: 本部スタッフは全件 / 本人は自分の行 / 書き込みは admin
create policy portal_users_read on portal.users
  for select using (portal.is_staff(auth.uid()) or id = auth.uid());
create policy portal_users_admin_write on portal.users
  for all using (portal.is_admin(auth.uid())) with check (portal.is_admin(auth.uid()));

-- members: 本部スタッフ全件 / 加盟店本人は自分のみ / 書き込みは admin or crm_staff
create policy portal_members_read on portal.members
  for select using (portal.is_staff(auth.uid()) or user_id = auth.uid());
create policy portal_members_staff_write on portal.members
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- payments: 本部スタッフ全件 / 加盟店は自分の分を閲覧 / 書き込みは admin
create policy portal_payments_read on portal.payments
  for select using (portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid()));
create policy portal_payments_admin_write on portal.payments
  for all using (portal.is_admin(auth.uid())) with check (portal.is_admin(auth.uid()));

-- CRM: admin or crm_staff のみ (要求書 Feature Matrix: member は CRM 不可)
create policy portal_crm_customers_all on portal.crm_customers
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));
create policy portal_crm_purchases_all on portal.crm_purchases
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));
create policy portal_crm_deals_all on portal.crm_deals
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));
create policy portal_crm_deal_notes_all on portal.crm_deal_notes
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- notifications: 宛先本人 or admin宛てを本部スタッフが読む
create policy portal_notifications_read on portal.notifications
  for select using (
    user_id = auth.uid()
    or (audience = 'admin' and portal.is_staff(auth.uid()))
  );
create policy portal_notifications_update on portal.notifications
  for update using (
    user_id = auth.uid()
    or (audience = 'admin' and portal.is_staff(auth.uid()))
  );
create policy portal_notifications_insert on portal.notifications
  for insert with check (portal.is_staff(auth.uid()));

-- =====================================================================
-- GRANTS
-- =====================================================================
grant select on all tables in schema portal to anon, authenticated;
grant insert, update, delete on all tables in schema portal to authenticated;
grant all on all tables in schema portal to service_role;
grant execute on all functions in schema portal to anon, authenticated, service_role;

alter default privileges in schema portal grant select on tables to anon, authenticated;
alter default privileges in schema portal grant insert, update, delete on tables to authenticated;
alter default privileges in schema portal grant all on tables to service_role;
alter default privileges in schema portal grant execute on functions to anon, authenticated, service_role;
