-- =====================================================================
-- Carbey Portal — フェーズ⑦-2: 本部サポート項目の CMS 化
-- =====================================================================
-- 背景（フェーズ⑥-4 / docs/onboarding-redesign.md §8 ④）:
--   本部サポートは今後項目が増える想定。本部が自分で項目を追加・編集・
--   並べ替え・公開できるように DB 化する（実践マニュアル CMS と同じ方式）。
--
--   重要（非弁類似リスク回避）: サポートは「代行」ではなく
--   「（有資格）業者の紹介・取次」名目。UI 文言から「代行」を排除する。
--   本テーブルは案内文を保持するのみで、法的な代行行為は行わない。
--
-- support_items : 本部が管理するサポートメニュー項目
-- 冪等化のため if exists / on conflict を併用。
-- =====================================================================

create table if not exists portal.support_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,          -- サポート項目名（例：古物商取得サポート（業者の紹介））
  body        text,                    -- 加盟店向けの案内文（紹介の内容）
  note        text,                    -- 本部メモ（加盟店には非表示）
  sort_order  int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_support_items_order on portal.support_items(sort_order);

drop trigger if exists trg_support_items_touch on portal.support_items;
create trigger trg_support_items_touch
  before update on portal.support_items
  for each row execute function portal.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table portal.support_items enable row level security;

-- 項目: 閲覧はログインユーザー全員（公開分・加盟店にも案内可）／編集は本部
drop policy if exists portal_support_items_read on portal.support_items;
create policy portal_support_items_read on portal.support_items
  for select using (auth.uid() is not null);
drop policy if exists portal_support_items_write on portal.support_items;
create policy portal_support_items_write on portal.support_items
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

grant select, insert, update, delete on portal.support_items to authenticated;
grant all on portal.support_items to service_role;

-- ---------------------------------------------------------------------
-- 既定のサポート項目（初回のみ・空なら投入）
-- 「代行」ではなく「紹介」名目。実際の申請は本人または紹介先の有資格者が行う。
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from portal.support_items) then
    insert into portal.support_items (title, body, sort_order) values
      (
        '古物商取得サポート（業者の紹介）',
        E'古物商許可の取得を希望される加盟店へ、行政書士・取得サポート業者をご紹介します。\n手続きの申請自体は加盟店ご本人、または紹介先の有資格者が行います。\n本部は申請の代行は行わず、有資格者の紹介・取次のみを行います。',
        10
      );
  end if;
end $$;
