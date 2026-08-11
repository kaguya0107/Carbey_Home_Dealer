-- 050: プラン別の機能表示制御（#18）＋ 加盟店ポータルへのCRM表示（#19）
--
-- #18: プランごとに、加盟店の左メニューの「AI分析・相場」「CRM（顧客管理）」を表示/非表示にできる。
-- #19: これまで本部専用だったCRMを、加盟店が「自分の顧客」だけ閲覧・編集できるようにRLSを追加。

-- ── #18 プランの機能フラグ ──────────────────────────────────────────
alter table portal.plans add column if not exists feature_ai  boolean not null default true;
alter table portal.plans add column if not exists feature_crm boolean not null default true;
comment on column portal.plans.feature_ai  is '加盟店の左メニューに「AI分析・相場」を表示するか（#18）';
comment on column portal.plans.feature_crm is '加盟店の左メニューに「CRM（顧客管理）」を表示するか（#18/#19）';

-- ── #19 加盟店が自分のCRMにアクセスできるRLS（本部の can_crm ポリシーは既存のまま） ──
-- crm_customers: 担当加盟店が自分のもの
drop policy if exists portal_crm_customers_member on portal.crm_customers;
create policy portal_crm_customers_member on portal.crm_customers
  for all using (member_id = portal.current_member_id(auth.uid()))
  with check (member_id = portal.current_member_id(auth.uid()));

-- crm_purchases: 顧客が自分の加盟店のもの
drop policy if exists portal_crm_purchases_member on portal.crm_purchases;
create policy portal_crm_purchases_member on portal.crm_purchases
  for all using (exists (select 1 from portal.crm_customers c where c.id = customer_id and c.member_id = portal.current_member_id(auth.uid())))
  with check (exists (select 1 from portal.crm_customers c where c.id = customer_id and c.member_id = portal.current_member_id(auth.uid())));

-- crm_deals: 顧客が自分の加盟店のもの
drop policy if exists portal_crm_deals_member on portal.crm_deals;
create policy portal_crm_deals_member on portal.crm_deals
  for all using (exists (select 1 from portal.crm_customers c where c.id = customer_id and c.member_id = portal.current_member_id(auth.uid())))
  with check (exists (select 1 from portal.crm_customers c where c.id = customer_id and c.member_id = portal.current_member_id(auth.uid())));

-- crm_deal_notes: 商談→顧客が自分の加盟店のもの
drop policy if exists portal_crm_deal_notes_member on portal.crm_deal_notes;
create policy portal_crm_deal_notes_member on portal.crm_deal_notes
  for all using (exists (
    select 1 from portal.crm_deals d join portal.crm_customers c on c.id = d.customer_id
    where d.id = deal_id and c.member_id = portal.current_member_id(auth.uid())))
  with check (exists (
    select 1 from portal.crm_deals d join portal.crm_customers c on c.id = d.customer_id
    where d.id = deal_id and c.member_id = portal.current_member_id(auth.uid())));
