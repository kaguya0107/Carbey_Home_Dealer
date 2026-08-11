-- 047: 出金チケットモデルの改定（2026-07-26 クライアント確定 #8）
--
-- 旧モデル（migration 044）:
--   ・年12回まで無料（withdrawal_tickets_per_year=12）
--   ・毎回 出金手数料5,000円を「申請額から」差し引いて振込
-- 新モデル（本migration）:
--   ・契約年ごとに無料枠 1枚（初回は無料）
--   ・2回目以降は「チケット代 5,000円」を"預かり金から"償却（会員は申請額を満額受取）
--   ・預かり金がチケット代を下回る場合は出金不可
--
-- テーブル構造は変更しない。withdrawal_requests の列を意味変更して流用する:
--   fee_yen … その申請のチケット代（無料=0／購入=5,000）
--   net_yen … 実際の振込額（= amount_yen。満額。手数料は差し引かない）

insert into portal.system_settings (key, value_int, note) values
  ('withdrawal_ticket_price_yen', 5000, '出金チケット代（2回目以降・預かり金から償却）'),
  ('withdrawal_free_per_year',       1, '契約年あたりの無料出金枠（初回無料）')
on conflict (key) do nothing;

-- 旧キーは参照されなくなるため注記のみ更新（値は保持）
update portal.system_settings set note = '【廃止】旧・出金手数料。withdrawal_ticket_price_yen へ移行' where key = 'withdrawal_fee_yen';
update portal.system_settings set note = '【廃止】旧・年間チケット枚数。withdrawal_free_per_year へ移行' where key = 'withdrawal_tickets_per_year';
