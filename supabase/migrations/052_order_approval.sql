-- 052: 半自動売買オーダーの承認/非承認（#24）
-- 本部が仕入れオーダーを承認（→対応中）／非承認（→キャンセル＋理由）できるようにする。
-- 既存の status（received/in_progress/completed/cancelled）を流用：received=承認待ち, 承認→in_progress, 非承認→cancelled。
alter table portal.orders add column if not exists reject_reason text;
alter table portal.orders add column if not exists approved_at   timestamptz;
alter table portal.orders add column if not exists approved_by   uuid references auth.users(id) on delete set null;
comment on column portal.orders.reject_reason is '非承認の理由（本部が入力・クイック理由も可・#24）';
comment on column portal.orders.approved_at is '承認日時（#24）';
