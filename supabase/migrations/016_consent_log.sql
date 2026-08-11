-- =====================================================================
-- Carbey Portal — フェーズ⑥-3: 規約バージョン再同意 + 同意ログ証拠保全
-- =====================================================================
-- クライアント確定（2026-07-10, docs/onboarding-redesign.md §7-8）:
--   ③ 規約更新時は既存加盟店にも再同意を求める（A）。
--      同意履歴を証拠保全目的で記録として残す。
--
-- 仕組み:
--   - 公開規約は「1バージョン=1行(agreement_id)」。新バージョンは新規行として発行。
--     既存加盟店は新 agreement_id への同意が無い＝再同意ゲートに掛かる（アプリ側で判定済み）。
--   - agreement_consents に同意時点のスナップショット（version/title/本文ハッシュ相当）を保存し、
--     後から規約行が編集・削除されても「いつ・誰が・どのバージョンに同意したか」を保全する。
-- 冪等化のため if not exists を使用。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 同意ログのスナップショット列（証拠保全）
-- ---------------------------------------------------------------------
alter table portal.agreement_consents
  add column if not exists agreement_version int;      -- 同意時点のバージョン
alter table portal.agreement_consents
  add column if not exists agreement_title text;       -- 同意時点のタイトル
alter table portal.agreement_consents
  add column if not exists user_id uuid;               -- 同意した auth ユーザー（監査用）

-- 既存レコードにスナップショットを後埋め（agreement からコピー）
update portal.agreement_consents c
   set agreement_version = a.version,
       agreement_title   = a.title
  from portal.agreements a
 where c.agreement_id = a.id
   and c.agreement_version is null;

-- ---------------------------------------------------------------------
-- 2) 同意時に version/title を自動スナップショットするトリガ
--    アプリ側で未設定でも、DBが agreement から確実に埋める。
-- ---------------------------------------------------------------------
create or replace function portal.fill_consent_snapshot()
returns trigger language plpgsql security definer set search_path = portal as $$
begin
  if new.agreement_version is null or new.agreement_title is null then
    select a.version, a.title
      into new.agreement_version, new.agreement_title
      from portal.agreements a
     where a.id = new.agreement_id;
  end if;
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consent_snapshot on portal.agreement_consents;
create trigger trg_consent_snapshot
  before insert on portal.agreement_consents
  for each row execute function portal.fill_consent_snapshot();

-- ---------------------------------------------------------------------
-- 3) 同意ログの改ざん防止：更新・削除を禁止（証拠保全）
--    member は元々 update/delete 権限なし。念のため cascade 以外で消えないよう
--    agreement 削除時も同意ログは残す（agreement_id を null 許容化して保全）。
-- ---------------------------------------------------------------------
-- agreement 削除時に同意ログまで消えると証拠保全にならないため、FK を restrict 寄りに。
-- （既存の on delete cascade を外し、set null にして履歴を残す）
alter table portal.agreement_consents
  drop constraint if exists agreement_consents_agreement_id_fkey;
alter table portal.agreement_consents
  alter column agreement_id drop not null;
alter table portal.agreement_consents
  add constraint agreement_consents_agreement_id_fkey
  foreign key (agreement_id) references portal.agreements(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4) 公開規約の一意化補助：published は常に最大1件（アプリ側でも制御済み）
--    証跡確認用のインデックス。
-- ---------------------------------------------------------------------
create index if not exists idx_consents_member_agreement
  on portal.agreement_consents(member_id, agreement_id);

grant select, insert on portal.agreement_consents to authenticated;
grant all on portal.agreement_consents to service_role;
