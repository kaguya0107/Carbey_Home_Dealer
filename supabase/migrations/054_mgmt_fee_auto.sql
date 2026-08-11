-- 054: 月額管理手数料の自動引き落とし（#33）
-- 現在の「本部が手動で月次実行」に加え、加盟者ごとに「自動引き落とし」を設定すると、
-- 満了月ごとに自動で清算できるようにするフラグ。実際の実行はスケジューラ（cron）が
-- /api/cron/mgmt-fee を叩き、mgmt_fee_auto=true の加盟者だけを対象に月次課金する。
alter table portal.members add column if not exists mgmt_fee_auto boolean not null default false;
comment on column portal.members.mgmt_fee_auto is '月額管理手数料の自動引き落とし（true=満了月ごとに自動清算・#33）';
