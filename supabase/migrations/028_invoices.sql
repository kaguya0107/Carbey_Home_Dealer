-- =====================================================================
-- Carbey Portal — 請求・入金消込（要件 5.2 消込機能 / PAY-01〜04）
-- =====================================================================
-- 要件（要求事項定義書 v1.0 6-4）:
--   PAY-01 加盟金/システム導入費/仕入れ金/ロイヤリティ/管理手数料/追加枠費用を管理
--   PAY-02 請求予定/請求済/入金済/未入金/遅延/分割中 のステータス
--   PAY-03 入金消込後、加盟店ダッシュボードに反映
--   PAY-04 支払遅延が発生したら本部ダッシュボードに警告
--
--   現状 payments は「入金実績」のみで、突合する「請求」が無く消込できない。
--   → invoices（請求）を新設し、payments.invoice_id で紐付けて消込する。
--     入金合計が請求額に達したら自動で paid、期限超過で overdue（トリガで自動判定）。
-- 冪等化のため if exists / on conflict を併用。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) invoices：請求（本部が加盟店へ請求する費目）
--    kind (PAY-01):
--      joining        加盟金
--      system_fee     システム導入費
--      monthly        月額費用
--      royalty        ロイヤリティ
--      management_fee 管理手数料
--      slot_fee       追加枠費用
--      sourcing_fund  仕入れ金
--      other          その他
--    status (PAY-02) はトリガで自動判定（billed→partial→paid / 期限超過で overdue）:
--      unbilled 請求予定 / billed 請求済(未入金) / partial 分割中(一部入金) /
--      paid 入金済 / overdue 遅延 / cancelled 取消
--    paid_yen は紐づく payments(confirmed) の合計をトリガで自動集計。
-- ---------------------------------------------------------------------
create table if not exists portal.invoices (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references portal.members(id) on delete cascade,
  kind        text not null default 'other'
                check (kind in ('joining','system_fee','monthly','royalty','management_fee','slot_fee','sourcing_fund','other')),
  title       text,                              -- 任意の件名（例：2026年7月分 月額）
  amount_yen  bigint not null check (amount_yen >= 0),  -- 請求額
  paid_yen    bigint not null default 0,         -- 入金済合計（payments から自動集計）
  due_date    date,                              -- 支払期限
  status      text not null default 'unbilled'
                check (status in ('unbilled','billed','partial','paid','overdue','cancelled')),
  billed_at   timestamptz,                       -- 請求（billed 化）日時
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_invoices_member on portal.invoices(member_id, created_at desc);
create index if not exists idx_invoices_status on portal.invoices(status);
create index if not exists idx_invoices_due    on portal.invoices(due_date);

drop trigger if exists trg_invoices_touch on portal.invoices;
create trigger trg_invoices_touch
  before update on portal.invoices
  for each row execute function portal.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2) payments に invoice_id を追加（消込：入金→請求の紐付け）
--    既存の payments（加盟金/月額の入金実績）はそのまま活用。
--    invoice_id null の入金は「未消込」（どの請求にも紐付いていない）。
-- ---------------------------------------------------------------------
alter table portal.payments add column if not exists invoice_id uuid references portal.invoices(id) on delete set null;
create index if not exists idx_payments_invoice on portal.payments(invoice_id);

-- ---------------------------------------------------------------------
-- 3) 消込ロジック：請求の paid_yen / status を自動再計算
--    - paid_yen = 紐づく payments(status=confirmed) の合計
--    - status:
--        cancelled は保持（手動取消）
--        paid_yen >= amount        → paid
--        paid_yen > 0              → partial
--        due_date < today かつ未完 → overdue
--        billed_at あり            → billed
--        それ以外                  → unbilled
-- ---------------------------------------------------------------------
create or replace function portal.recompute_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = portal as $$
declare
  v_amount bigint;
  v_paid   bigint;
  v_due    date;
  v_billed timestamptz;
  v_status text;
begin
  select amount_yen, due_date, billed_at, status
    into v_amount, v_due, v_billed, v_status
    from portal.invoices where id = p_invoice_id;
  if not found then return; end if;

  -- 取消は自動遷移させない
  if v_status = 'cancelled' then
    return;
  end if;

  select coalesce(sum(amount_yen), 0) into v_paid
    from portal.payments
    where invoice_id = p_invoice_id and status = 'confirmed';

  if v_paid >= v_amount and v_amount > 0 then
    v_status := 'paid';
  elsif v_paid > 0 then
    v_status := 'partial';
  elsif v_due is not null and v_due < current_date then
    v_status := 'overdue';
  elsif v_billed is not null then
    v_status := 'billed';
  else
    v_status := 'unbilled';
  end if;

  update portal.invoices
    set paid_yen = v_paid, status = v_status, updated_at = now()
    where id = p_invoice_id;
end;
$$;

-- payments の変更で、紐づく請求（新旧両方）を再計算
create or replace function portal.trg_payment_reconcile()
returns trigger language plpgsql security definer set search_path = portal as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.invoice_id is not null then
    perform portal.recompute_invoice(new.invoice_id);
  end if;
  if tg_op in ('UPDATE','DELETE') and old.invoice_id is not null
     and (tg_op = 'DELETE' or new.invoice_id is distinct from old.invoice_id) then
    perform portal.recompute_invoice(old.invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_payments_reconcile on portal.payments;
create trigger trg_payments_reconcile
  after insert or update or delete on portal.payments
  for each row execute function portal.trg_payment_reconcile();

-- 請求自身の更新（金額・期限・billed_at）でも status を追従させる
create or replace function portal.trg_invoice_selfrecompute()
returns trigger language plpgsql security definer set search_path = portal as $$
begin
  -- 無限ループ防止：status/paid_yen/updated_at 以外が変わったときだけ再計算
  if tg_op = 'INSERT'
     or new.amount_yen is distinct from old.amount_yen
     or new.due_date   is distinct from old.due_date
     or new.billed_at  is distinct from old.billed_at then
    perform portal.recompute_invoice(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_selfrecompute on portal.invoices;
create trigger trg_invoices_selfrecompute
  after insert or update on portal.invoices
  for each row execute function portal.trg_invoice_selfrecompute();

-- ---------------------------------------------------------------------
-- 4) 遅延の日次判定用：期限超過かつ未入金の請求を overdue へ（バッチ/オンデマンド）
--    アプリ側で本部ダッシュボード表示前に呼ぶ（PAY-04）。
-- ---------------------------------------------------------------------
create or replace function portal.refresh_overdue_invoices()
returns void language plpgsql security definer set search_path = portal as $$
begin
  update portal.invoices
    set status = 'overdue', updated_at = now()
    where status in ('billed','unbilled')
      and due_date is not null
      and due_date < current_date
      and paid_yen = 0;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS：本部は全件・加盟店は自分の請求のみ閲覧（PAY-03 反映）。編集は can_crm。
-- ---------------------------------------------------------------------
alter table portal.invoices enable row level security;

drop policy if exists portal_invoices_read on portal.invoices;
create policy portal_invoices_read on portal.invoices
  for select using (portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid()));

drop policy if exists portal_invoices_write on portal.invoices;
create policy portal_invoices_write on portal.invoices
  for all using (portal.can_crm(auth.uid())) with check (portal.can_crm(auth.uid()));

grant select on portal.invoices to authenticated;
grant insert, update, delete on portal.invoices to authenticated;
grant all on portal.invoices to service_role;
