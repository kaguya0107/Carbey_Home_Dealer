-- =====================================================================
-- Carbey Portal — オンボーディング再設計 フェーズ②: 利用規約
-- =====================================================================
-- クライアント要件（レビュー ⑫⑬）:
--   - 資金調達の有無に関わらず、利用規約に同意する を押下させて遷移
--   - 加盟店画面：利用規約 確認ページ
--   - 本部画面：利用規約の設定ページ（編集・公開）
--
-- agreements       : 本部が編集・公開する利用規約（バージョン管理）
-- agreement_consents : 加盟店の同意記録
-- 冪等化のため if exists / on conflict を併用。
-- =====================================================================

create table if not exists portal.agreements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,            -- 規約本文（プレーン/マークダウン）
  version     int not null default 1,
  published   boolean not null default false,
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_agreements_published on portal.agreements(published, created_at desc);

drop trigger if exists trg_agreements_touch on portal.agreements;
create trigger trg_agreements_touch
  before update on portal.agreements
  for each row execute function portal.touch_updated_at();

create table if not exists portal.agreement_consents (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references portal.members(id) on delete cascade,
  agreement_id uuid not null references portal.agreements(id) on delete cascade,
  agreed_at    timestamptz not null default now(),
  unique (member_id, agreement_id)
);

create index if not exists idx_consents_member on portal.agreement_consents(member_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table portal.agreements enable row level security;
alter table portal.agreement_consents enable row level security;

-- 規約: 閲覧はログインユーザー全員（公開分）／編集は本部
drop policy if exists portal_agreements_read on portal.agreements;
create policy portal_agreements_read on portal.agreements
  for select using (auth.uid() is not null);
drop policy if exists portal_agreements_write on portal.agreements;
create policy portal_agreements_write on portal.agreements
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

-- 同意記録: 本部は全件閲覧／加盟店は自分の分の閲覧・作成
drop policy if exists portal_consents_read on portal.agreement_consents;
create policy portal_consents_read on portal.agreement_consents
  for select using (
    portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid())
  );
drop policy if exists portal_consents_insert on portal.agreement_consents;
create policy portal_consents_insert on portal.agreement_consents
  for insert with check (member_id = portal.current_member_id(auth.uid()));

-- GRANT
grant select, insert, update, delete on portal.agreements to authenticated;
grant select, insert on portal.agreement_consents to authenticated;
grant all on portal.agreements, portal.agreement_consents to service_role;

-- ---------------------------------------------------------------------
-- 既定の利用規約（初回のみ・空なら投入）
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from portal.agreements) then
    insert into portal.agreements (title, body, version, published) values (
      'カーベイホームディーラー 加盟店利用規約',
      E'第1条（総則）\n本規約は、カーベイホームディーラー加盟店プラットフォーム（以下「本サービス」）の利用条件を定めるものです。\n\n第2条（加盟店の義務）\n加盟店は、本サービスの利用にあたり、法令および本規約を遵守するものとします。\n\n第3条（本人確認・古物商許可）\n加盟店は、本部の求めに応じて本人確認書類を提出し、古物営業に必要な許可を取得するものとします。\n\n第4条（禁止事項）\n加盟店は、本サービスを不正に利用してはなりません。\n\n第5条（免責）\n本部は、本サービスの利用により生じた損害について、法令に定める場合を除き責任を負いません。\n\n（本規約は本部により随時更新されます。最新の内容をご確認ください。）',
      1, true
    );
  end if;
end $$;
