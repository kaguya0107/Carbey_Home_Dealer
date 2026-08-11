-- 053: 預かり金台帳に「ロイヤリティ」種別を追加（#30）
-- 売却記録時に、粗利益 × プラン料率（ブロンズ20%/プラチナ15%/ゴールド10% 等）を預かり金から控除する。
alter table portal.ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table portal.ledger_entries
  add constraint ledger_entries_kind_check
  check (kind in ('deposit', 'withdraw', 'settlement', 'adjust', 'mgmt_fee', 'royalty'));
