import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, Eye, Download, Clock, XCircle, Wallet, Lock, ScrollText, ShoppingCart, ChevronRight, Trash2 } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { getMember, listPayments } from '@/lib/portal/members'
import { listPlans } from '@/lib/portal/plans'
import { listEvidences } from '@/lib/portal/evidence'
import { getFunding, LOAN_STEPS } from '@/lib/portal/funding'
import { getMemberOrderSummary } from '@/lib/portal/orders'
import { getMemberCapabilities } from '@/lib/portal/capabilities'
import { getLedgerBalance, listLedgerEntries } from '@/lib/portal/ledger'
import { getMemberDealSummary, listDeletedDeals, DEAL_STAGE_LABEL } from '@/lib/portal/deals'
import { getSalesSummary } from '@/lib/portal/sales'
import { getMemberAutoCapacity, getAutoSettings } from '@/lib/portal/auto-trading'
import { listInvoices, listPaymentsByInvoice, INVOICE_KIND_LABEL, INVOICE_STATUS_LABEL } from '@/lib/portal/billing'
import { listConsentLog } from '@/lib/portal/agreements'
import { listAuditLogsForTarget } from '@/lib/portal/audit'
import { MEMBER_STATUS_LABEL, yen } from '@/lib/portal/labels'
import { Badge } from '@/components/ui/Badge'
import { ConfirmSubmit } from '@/components/admin/ConfirmSubmit'
import { updateMemberAction, issueCredentialsAction, softDeleteMemberAction, restoreMemberAction } from '../actions'
import { reviewEvidenceAction } from '../evidence-actions'
import { confirmSelfAction, setAdminStepAction, setFundingMethodAction } from '../funding-actions'
import { addLedgerEntryAction, deleteLedgerEntryAction } from '../ledger-actions'
import { createInvoiceAction, createSlotPurchaseAction, runMemberMgmtFeeAction, setMgmtFeeAutoAction, setSlotCapitalAction, recordPaymentAction, markBilledAction, cancelInvoiceAction, deleteInvoiceAction } from '../billing-actions'
import { getMgmtFeePreview, listMgmtFeeRuns } from '@/lib/portal/mgmt-fee'
import MemberFormFields from '../MemberFormFields'

const INVOICE_STATUS_TONE: Record<string, string> = {
  unbilled: 'bg-slate-100 text-slate-600',
  billed: 'bg-info-50 text-info-700',
  partial: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400 line-through',
}

const LEDGER_KIND_LABEL: Record<string, string> = {
  deposit: '入金（デポジット）',
  withdraw: '出金',
  settlement: '取引精算',
  adjust: '調整',
  mgmt_fee: '月額管理手数料',
  royalty: 'ロイヤリティ',
}

// #26 入金履歴（すべての入金）の表示ラベル
const PAYMENT_KIND_LABEL: Record<string, string> = { joining: '加盟金', monthly: '月額', other: 'その他' }
const PAYMENT_STATUS_JA: Record<string, string> = { pending: '確認待ち', confirmed: '入金済み', failed: '失敗' }

export const dynamic = 'force-dynamic'

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ msg?: string; cred?: string; pw?: string; error?: string; del?: string; saved?: string }>
}) {
  await requireFeature('members')
  const { id } = await params
  const sp = await searchParams
  const [member, plans, payments, evidences] = await Promise.all([
    getMember(id), listPlans(false), listPayments(id), listEvidences(id),
  ])
  if (!member) notFound()
  const [funding, consents, orderSummary, capabilities, ledgerBalance, ledgerEntries, invoices, dealSummary, memberSales, mgmtFee, mgmtFeeRuns] = await Promise.all([
    getFunding(member.id), listConsentLog(member.id), getMemberOrderSummary(member.id), getMemberCapabilities(member.id),
    getLedgerBalance(member.id), listLedgerEntries(member.id), listInvoices(member.id),
    getMemberDealSummary(member.id), getSalesSummary(member.id),
    getMgmtFeePreview(member.id), listMgmtFeeRuns(member.id),
  ])
  const auditLogs = await listAuditLogsForTarget('member', member.id, 10) // 監査ログ（削除・復元など・migration 048）
  const deletedDeals = await listDeletedDeals(member.id) // ㊸ 削除された案件の履歴（記録保全・migration 056）
  // ㊵ 自動売買の枠：現在の有効枠プレビュー＋最低値/最高値の設定用
  const [autoCap, autoSettings] = member.grant_auto
    ? await Promise.all([getMemberAutoCapacity(member.id), getAutoSettings()])
    : [null, null]
  // 各請求の消込内訳（入金明細）— 1クエリでまとめて取得（性能最適化A）
  const invoicePayments = await listPaymentsByInvoice(invoices.map((inv) => inv.id))
  const billingTotals = invoices.reduce(
    (acc, inv) => {
      if (inv.status === 'cancelled' || inv.status === 'unbilled') return acc
      acc.billed += inv.amount_yen
      acc.paid += inv.paid_yen
      if (inv.status === 'overdue') acc.overdue++
      return acc
    },
    { billed: 0, paid: 0, overdue: 0 },
  )
  const outstanding = Math.max(0, billingTotals.billed - billingTotals.paid)

  // #26 入金履歴（すべての入金）＝ 仕入れ資金のデポジット入金（台帳）＋ 加盟金/月額など（payments）を時系列で統合
  const incoming = [
    ...ledgerEntries
      .filter((e) => e.kind === 'deposit')
      .map((e) => ({ id: `l-${e.id}`, date: e.created_at.slice(0, 10), kindLabel: '仕入れ資金デポジット', amount: Math.abs(e.amount_yen), status: '入金済み', note: e.note ?? null })),
    ...payments.map((p) => ({ id: `p-${p.id}`, date: p.payment_date, kindLabel: PAYMENT_KIND_LABEL[p.kind] ?? p.kind, amount: p.amount_yen, status: PAYMENT_STATUS_JA[p.status] ?? p.status, note: p.note })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const onboardingPct = member.onboarding_total
    ? Math.round((member.onboarding_done / member.onboarding_total) * 100)
    : 0

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/members" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        加盟店一覧へ
      </Link>

      {member.deleted_at && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-sm text-amber-800">
            <span className="font-semibold">この会員は削除済みです</span>
            <span className="ml-2 text-xs text-amber-700">（{new Date(member.deleted_at).toLocaleString('ja-JP')} 削除・一覧には表示されません／記録は保全）</span>
          </div>
          <form action={restoreMemberAction}>
            <input type="hidden" name="id" value={member.id} />
            <button className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">復元する</button>
          </form>
        </div>
      )}
      {sp.del === 'restored' && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">会員を復元しました。</div>}
      {sp.del === 'error' && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">削除／復元に失敗しました：{sp.msg}</div>}

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-lg font-semibold text-white">
          {member.member_name.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{member.member_name}</h1>
            <Badge tone={member.status === 'active' ? 'green' : member.status === 'pending' ? 'amber' : member.status === 'suspended' ? 'red' : 'slate'}>
              {MEMBER_STATUS_LABEL[member.status]}
            </Badge>
          </div>
          {member.company_name && <p className="text-sm text-slate-500">{member.company_name}</p>}
        </div>
      </div>

      {/* 結果バナー */}
      {sp.cred === 'issued' && sp.pw && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <CheckCircle2 className="h-4 w-4" /> ログイン情報を発行しました
          </div>
          <p className="mt-1 text-xs text-green-700">下記の認証情報を加盟店へお伝えください。このパスワードは再表示できません。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-green-200 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">メールアドレス（ログインID）</div>
              <div className="font-mono text-sm text-slate-900">{member.email}</div>
            </div>
            <div className="rounded-lg border border-green-200 bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">パスワード</div>
              <div className="font-mono text-sm font-semibold text-slate-900">{sp.pw}</div>
            </div>
          </div>
        </div>
      )}
      {sp.cred === 'no_email' && (
        <div className="mb-4 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          ログイン発行にはメールアドレスが必要です。上部フォームでメールアドレスを登録してください。
        </div>
      )}
      {sp.cred === 'error' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">発行に失敗しました{sp.msg ? `: ${sp.msg}` : ''}</div>
      )}
      {sp.error === 'contract_date_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          契約ステータスを「稼働中（active）」にするには契約日が必須です（古物商許可の6ヶ月猶予の起算日になります）。契約日を入力して保存してください。
        </div>
      )}
      {sp.error === 'email_duplicate' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          このメールアドレスは既に別の会員に登録されています。会員ごとに異なるメールアドレスを設定してください（1メール＝1会員）。
        </div>
      )}
      {sp.error === 'plan_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          契約ステータスを「稼働中（active）」にするには契約プランの選択が必須です。プランを選択して保存してください。
        </div>
      )}
      {sp.error === 'grant_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          契約ステータスを「稼働中（active）」にするには、運用方式の権限（セミオート／フルオート／両方）を1つ以上割り当ててください。
        </div>
      )}
      {sp.error && !['contract_date_required', 'email_duplicate', 'plan_required', 'grant_required'].includes(sp.error) && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</div>
      )}
      {sp.saved === 'slotcapital' && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">自動売買の枠の資金設定（最低値・最高値）を保存しました。</div>
      )}
      {sp.msg && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{sp.msg}</div>
      )}

      {/* ===== ログイン発行（本部が直接パスワードを発行する発行型フロー） ===== */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-slate-900">ログイン発行・権限</h2>
          {member.user_id ? (
            <span className="ml-auto flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> アカウント連携済み</span>
          ) : (
            <span className="ml-auto text-xs text-slate-400">未発行</span>
          )}
        </div>

        {member.email ? (
          <form action={issueCredentialsAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={member.id} />
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">パスワード（空欄で自動生成）</label>
              <input name="password" placeholder="自動生成する場合は空欄" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">権限</label>
              <select disabled className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <option>加盟店（member）</option>
              </select>
            </div>
            <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              {member.user_id ? 'パスワードを再発行' : 'ログイン情報を発行'}
            </button>
          </form>
        ) : (
          <p className="text-xs text-slate-400">発行にはメールアドレスの登録が必要です。</p>
        )}

        <p className="mt-2 text-xs text-slate-400">
          発行後、メール・パスワードを加盟店へ共有すると、加盟店はそのままログインできます。
        </p>
      </div>

      {/* サマリ行 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* ④ プラン（契約）と 運用方式の権限（セミ/フル）は別設定。実効フローも併記する。 */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">プラン / 権限 / フロー</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {member.plan ? (
              <Badge tone="slate">{member.plan.name}</Badge>
            ) : (
              <span className="text-sm font-semibold text-amber-600">プラン未割当</span>
            )}
            {member.grant_semi && (
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">セミオート</span>
            )}
            {member.grant_auto && (
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">フルオート</span>
            )}
            {!member.grant_semi && !member.grant_auto && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">運用権限なし</span>
            )}
            {/* ㉕ オンボーディング未完了でも取引可の特例 */}
            {member.trading_override && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800" title="オンボーディング未完了でも仕入れオーダーを許可しています">
                取引 特例許可
              </span>
            )}
            {/* 実効フロー（active_flow 未設定でも権限から導出される） */}
            {capabilities && (member.grant_semi || member.grant_auto) && (
              <span className="rounded bg-info-50 px-1.5 py-0.5 text-[10px] font-medium text-info-700">
                現在：{capabilities.flow === 'auto' ? '自動売買' : '半自動売買'}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">登録日</div>
          <div className="text-sm font-semibold text-slate-900">{member.registration_date}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">月額</div>
          <div className="text-sm font-semibold text-slate-900">{yen(member.monthly_fee_yen)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">契約日</div>
          <div className="text-sm font-semibold text-slate-900">{member.contract_date ?? '—'}</div>
        </div>
      </div>

      {/* オンボーディング進捗 + オーダー状況（可視化） */}
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* 進捗バー */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">オンボーディング進捗</span>
            <span className="text-sm font-bold text-slate-900">{onboardingPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${onboardingPct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${onboardingPct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{member.onboarding_done}/{member.onboarding_total} タスク完了</span>
            <Link href={`/admin/onboarding/${member.id}`} className="flex items-center gap-0.5 font-medium text-brand-600 hover:underline">
              進捗を管理 <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* オーダー状況 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ShoppingCart className="h-4 w-4 text-brand-500" /> オーダー状況
            </span>
            <div className="flex items-center gap-3">
              <Link href={`/admin/crm?member=${member.id}`} className="flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline">
                CRM顧客 <ChevronRight className="h-3 w-3" />
              </Link>
              <Link href={`/admin/orders?member=${member.id}`} className="flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline">
                半自動売買オーダー管理 <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 py-2">
              <div className="text-lg font-bold text-slate-900">{orderSummary.total}</div>
              <div className="text-[10px] text-slate-500">合計</div>
            </div>
            <div className="rounded-lg bg-amber-50 py-2">
              <div className="text-lg font-bold text-amber-700">{orderSummary.received}</div>
              <div className="text-[10px] text-slate-500">受付</div>
            </div>
            <div className="rounded-lg bg-sky-50 py-2">
              <div className="text-lg font-bold text-sky-700">{orderSummary.in_progress}</div>
              <div className="text-[10px] text-slate-500">対応中</div>
            </div>
            <div className="rounded-lg bg-emerald-50 py-2">
              <div className="text-lg font-bold text-emerald-700">{orderSummary.completed}</div>
              <div className="text-[10px] text-slate-500">完了</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 担当車両サマリ（㉓ 全体連携：車両進捗管理と連動） ===== */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShoppingCart className="h-4 w-4 text-brand-500" /> 担当車両（進捗・販売実績）
          </h2>
          <Link href={`/admin/vehicles?member=${member.id}`} className="flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline">
            自動・半自動売買進捗管理 <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
          {(['sourcing', 'prepping', 'listing', 'delivered', 'sold'] as const).map((s) => (
            <div key={s} className="rounded-lg bg-slate-50 py-2">
              <div className="text-lg font-bold text-slate-900">{dealSummary[s]}</div>
              <div className="text-[10px] text-slate-500">{DEAL_STAGE_LABEL[s]}</div>
            </div>
          ))}
        </div>
        {memberSales.count > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>売上 <span className="font-semibold text-slate-900">{yen(memberSales.revenueYen)}</span></span>
            <span>粗利益 <span className="font-semibold text-emerald-700">{yen(memberSales.profitYen)}</span></span>
            <span>利益率 <span className="font-semibold text-slate-900">{memberSales.marginPct}%</span></span>
          </div>
        )}
      </div>

      {/* ===== 利用可能機能（権限・フロー連動で自動制御／㉕・④） ===== */}
      {capabilities && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="h-4 w-4 text-brand-500" /> 利用可能機能（権限連動・自動制御）
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            運用方式の権限・売買フロー・オンボーディング完了状況・古物商猶予に応じて自動で制御されます（ここでの手動設定ではありません）。
            現在のフロー：<span className="font-medium text-slate-700">{capabilities.flow === 'auto' ? '自動売買' : '半自動売買'}</span>
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {capabilities.capabilities.map((c) => (
              <li key={c.key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${c.allowed ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}>
                {c.allowed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                )}
                <div className="min-w-0">
                  <div className={c.allowed ? 'text-slate-800' : 'text-slate-500'}>{c.label}</div>
                  {!c.allowed && c.reason && <div className="text-[11px] text-slate-400">{c.reason}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== エビデンス確認（本人確認・古物商） ===== */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-brand-500" /> 提出書類の確認
        </h2>
        {evidences.length === 0 ? (
          <p className="text-xs text-slate-400">まだ書類が提出されていません。</p>
        ) : (
          <ul className="space-y-2">
            {evidences.map((ev) => {
              const kindLabel = ev.kind === 'identity' ? '本人確認' : ev.kind === 'antique_license' ? '古物商許可証' : 'その他'
              const docLabel: Record<string, string> = { license: '運転免許証', mynumber: 'マイナンバー', passport: 'パスポート', antique: '古物商許可証', other: 'その他' }
              const url = `/api/portal/evidence/${ev.id}`
              const isImage = ev.file_type?.startsWith('image/')
              return (
                <li key={ev.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-3">
                    {/* ㉘ 画像はサムネイルをインライン表示（本部の確認用） */}
                    {isImage && (
                      <a href={url} target="_blank" rel="noopener noreferrer" title="クリックで拡大" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={ev.file_name} className="h-12 w-12 rounded object-cover ring-1 ring-slate-200" loading="lazy" />
                      </a>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        {kindLabel}{ev.doc_type ? `・${docLabel[ev.doc_type]}` : ''}
                      </div>
                      <div className="truncate text-xs text-slate-500">{ev.file_name} ・ {new Date(ev.created_at).toLocaleDateString('ja-JP')}</div>
                    </div>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      ev.status === 'approved' ? 'bg-green-50 text-green-700' : ev.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {ev.status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> : ev.status === 'rejected' ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {ev.status === 'approved' ? '承認済み' : ev.status === 'rejected' ? '却下' : '確認待ち'}
                    </span>
                    <a href={url} target="_blank" rel="noopener noreferrer" title="プレビュー" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><Eye className="h-4 w-4" /></a>
                    <a href={`${url}?download=1`} title="ダウンロード" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><Download className="h-4 w-4" /></a>
                  </div>
                  {ev.status === 'pending' && (
                    <form action={reviewEvidenceAction} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="evidence_id" value={ev.id} />
                      <input type="hidden" name="member_id" value={member.id} />
                      <input name="note" placeholder="却下理由（任意）" className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none" />
                      <button name="status" value="approved" className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">承認</button>
                      <button name="status" value="rejected" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">却下</button>
                    </form>
                  )}
                  {ev.status === 'rejected' && ev.note && <p className="mt-1 text-xs text-red-600">却下理由：{ev.note}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ===== 資金準備の確認（自己資金 / 資金調達）— ㊹ 分岐を選択式で可視化 ===== */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Wallet className="h-4 w-4 text-brand-500" /> 資金準備の確認
        </h2>

        {/* 分岐の選択（自己資金 / 資金調達）— 本部が選択可・現在の選択をハイライト */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-slate-500">資金準備の方法（分岐）を選択してください。加盟店側の選択とも同期します。</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              { m: 'self' as const, label: '自己資金', desc: '自己資金で準備（本部が金額を確認）' },
              { m: 'loan' as const, label: '資金調達', desc: 'ローン等で調達（ステップで進行）' },
            ]).map((opt) => {
              const active = funding?.method === opt.m
              return (
                <form key={opt.m} action={setFundingMethodAction}>
                  <input type="hidden" name="member_id" value={member.id} />
                  <input type="hidden" name="method" value={opt.m} />
                  <button className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-slate-700'}`}>{opt.label}</span>
                      {active
                        ? <span className="flex items-center gap-1 text-[11px] font-medium text-brand-600"><CheckCircle2 className="h-3.5 w-3.5" /> 選択中</span>
                        : <span className="text-[11px] text-slate-400">選択する</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{opt.desc}</p>
                  </button>
                </form>
              )
            })}
          </div>
          {!funding?.method && <p className="mt-2 text-[11px] text-amber-600">まだ方法が選択されていません。上のいずれかを選択してください。</p>}
        </div>

        {/* 選択した分岐の詳細（可視化） */}
        {funding?.method === 'self' ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <Badge tone="slate">自己資金</Badge>
              <span className="font-semibold text-slate-900">{yen(funding.self_amount_yen)}</span>
              {funding.self_confirmed && <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> 確認済み</span>}
            </div>
            {funding.self_amount_yen == null ? (
              <p className="text-xs text-slate-400">加盟店による自己資金額の登録待ちです。</p>
            ) : (
              <form action={confirmSelfAction} className="flex items-center gap-2">
                <input type="hidden" name="member_id" value={member.id} />
                {funding.self_confirmed ? (
                  <button name="confirmed" value="0" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">確認を取消</button>
                ) : (
                  <button name="confirmed" value="1" className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">自己資金を確認</button>
                )}
              </form>
            )}
          </div>
        ) : funding?.method === 'loan' ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <Badge tone="slate">資金調達</Badge>
              {funding.status === 'completed' && <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> 完了</span>}
            </div>
            <ol className="space-y-1.5">
              {LOAN_STEPS.map((step, i) => {
                const done = funding.step_status?.[step.key] === 'done'
                const prevDone = LOAN_STEPS.slice(0, i).every((s) => funding.step_status?.[s.key] === 'done')
                const isAdmin = step.actor === 'admin'
                return (
                  <li key={step.key} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-brand-500 text-white' : 'border border-slate-300 text-slate-400'}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={`flex-1 text-sm ${done ? 'text-slate-500' : 'text-slate-800'}`}>{step.label}</span>
                    <span className="text-[11px] text-slate-400">{isAdmin ? '本部' : '加盟店'}</span>
                    {isAdmin ? (
                      <form action={setAdminStepAction}>
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="step_key" value={step.key} />
                        {done ? (
                          <button name="done" value="0" className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">取消</button>
                        ) : prevDone ? (
                          <button name="done" value="1" className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600">完了にする</button>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400"><Lock className="h-3 w-3" /> 前工程待ち</span>
                        )}
                      </form>
                    ) : (
                      <span className={`text-[11px] ${done ? 'text-green-600' : 'text-slate-400'}`}>{done ? '完了' : '加盟店対応'}</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        ) : null}
      </div>

      {/* ===== 利用規約 同意履歴（証拠保全ログ） ===== */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ScrollText className="h-4 w-4 text-brand-500" /> 利用規約 同意履歴
        </h2>
        {consents.length === 0 ? (
          <p className="text-xs text-slate-400">まだ同意記録がありません。</p>
        ) : (
          <ul className="space-y-1.5">
            {consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span className="min-w-0 flex-1 text-slate-800">
                  {c.agreement_title ?? '（規約）'}
                  {c.agreement_version != null && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">v{c.agreement_version}</span>}
                </span>
                <span className="text-xs text-slate-500">{new Date(c.agreed_at).toLocaleString('ja-JP')}</span>
                {/* #42 同意した規約の内容（本文・別添）を本部で確認できる導線。版ごとに保全された内容を読み取り専用表示。 */}
                {c.agreement_id ? (
                  <a href={`/admin/terms?view=${c.agreement_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-info-600 hover:bg-slate-50">
                    <Eye className="h-3.5 w-3.5" /> 内容を確認
                  </a>
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-400">規約は削除済み（記録のみ保全）</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-slate-400">同意記録は改ざん防止のため保全されます（規約が更新・削除されても履歴は残ります）。「内容を確認」で、その版の本文・別添（料金表・規定など）を確認できます。</p>
      </div>

      {/* ㊸ 削除された案件の履歴（記録保全・別テーブル。集計には含まれない） */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Trash2 className="h-4 w-4 text-slate-400" /> 削除された案件の履歴
        </h2>
        <p className="mb-3 text-[11px] text-slate-400">取消・オーダーのキャンセルで削除された案件を、記録保全として別に残しています（売上・利益の集計には含まれません）。</p>
        {deletedDeals.length === 0 ? (
          <p className="text-xs text-slate-400">削除された案件はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">車両</th>
                  <th className="px-3 py-2 font-medium">削除時ステージ</th>
                  <th className="px-3 py-2 text-right font-medium">売上</th>
                  <th className="px-3 py-2 text-right font-medium">粗利益</th>
                  <th className="px-3 py-2 font-medium">理由</th>
                  <th className="px-3 py-2 font-medium">削除日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deletedDeals.map((d) => {
                  const stage = ({ sourcing: '仕入れ中', prepping: '商品化中', listing: '販売中', delivered: '納品完了', sold: '売却済み', ordered: '発注' } as Record<string, string>)[d.status_at_deletion ?? ''] ?? d.status_at_deletion ?? '—'
                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">
                        {[d.maker, d.car_model].filter(Boolean).join(' ') || '—'}
                        {d.order_number && <span className="ml-1 text-[10px] text-slate-400">{d.order_number}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{stage}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{d.sale_price_yen != null ? yen(d.sale_price_yen) : '—'}</td>
                      <td className={`px-3 py-2 text-right ${(d.gross_profit_yen ?? 0) >= 0 ? 'text-slate-600' : 'text-red-600'}`}>{d.gross_profit_yen != null ? yen(d.gross_profit_yen) : '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{d.reason ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(d.deleted_at).toLocaleString('ja-JP')}
                        {d.deleted_by_name && <div className="text-[10px] text-slate-400">{d.deleted_by_name}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 編集フォーム */}
      <form action={updateMemberAction}>
        <input type="hidden" name="id" value={member.id} />
        <MemberFormFields plans={plans} member={member} showPaymentStatus />
        <div className="mt-6 flex justify-end">
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            変更を保存
          </button>
        </div>
      </form>

      {/* ===== 資金管理（仕入れ資金・預かり金台帳／半自動売買フェーズ1） ===== */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Wallet className="h-4 w-4 text-brand-500" /> 仕入れ資金（預かり金）
          </h2>
          <div className="text-right">
            <div className="text-[11px] text-slate-500">預かり残高</div>
            <div className={`text-lg font-bold ${ledgerBalance > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{yen(ledgerBalance)}</div>
          </div>
        </div>

        {/* 加盟金 支払状況（既存 payment_status を表示） */}
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <span className="text-slate-500">加盟金 支払状況：</span>
          <Badge tone={member.payment_status === 'paid' ? 'green' : member.payment_status === 'overdue' ? 'red' : 'amber'}>
            {member.payment_status === 'paid' ? '支払済み' : member.payment_status === 'overdue' ? '延滞' : '未払い'}
          </Badge>
          <span className="text-slate-400">加盟金：{yen(member.joining_fee_yen)}</span>
        </div>

        {/* 入出金の登録 */}
        <form action={addLedgerEntryAction} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="member_id" value={member.id} />
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">種別</label>
            <select name="kind" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              <option value="deposit">入金（デポジット）</option>
              <option value="withdraw">出金</option>
              <option value="adjust">調整（＋）</option>
              <option value="settlement">取引精算（－）</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">金額（円）</label>
            <input name="amount" inputMode="numeric" placeholder="1000000" className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-[11px] text-slate-500">メモ（任意）</label>
            <input name="note" placeholder="仕入れ資金デポジット 等" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </div>
          <button className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">登録</button>
        </form>

        {/* 入出金履歴 */}
        {ledgerEntries.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {ledgerEntries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 text-xs text-slate-500">{new Date(e.created_at).toLocaleDateString('ja-JP')}</span>
                <span className="w-32 text-xs text-slate-600">{LEDGER_KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className={`w-28 font-medium ${e.amount_yen >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {e.amount_yen >= 0 ? '+' : ''}{yen(e.amount_yen)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{e.note ?? ''}</span>
                <form action={deleteLedgerEntryAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="member_id" value={member.id} />
                  <button className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="取消"><XCircle className="h-4 w-4" /></button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===== 請求・入金消込（要件 5.2 消込機能 / PAY-01〜04） ===== */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Wallet className="h-4 w-4 text-brand-500" /> 請求・入金消込
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">請求 <span className="font-semibold text-slate-800">{yen(billingTotals.billed)}</span></span>
            <span className="text-slate-500">入金 <span className="font-semibold text-green-700">{yen(billingTotals.paid)}</span></span>
            <span className="text-slate-500">未収 <span className={`font-semibold ${outstanding > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{yen(outstanding)}</span></span>
            {billingTotals.overdue > 0 && (
              <span className="rounded bg-red-50 px-2 py-0.5 font-semibold text-red-700">遅延 {billingTotals.overdue}件</span>
            )}
          </div>
        </div>

        {/* 自動売買の枠購入（3枠目以降・1枠=10万円）— 消込完了で auto_slots が自動加算（⑦フェーズ5 / 2026-07-21 改定） */}
        {member.grant_auto && (() => {
          const currentSlots = member.auto_slots ?? 0
          const planDefault = member.plan?.default_auto_slots ?? 0
          const purchasable = planDefault >= 2 // エコノミー等（既定1枠）は枠固定で追加購入不可
          const remainingSlots = Math.max(0, 10 - currentSlots)
          if (!purchasable) {
            return (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                このプランは枠数が固定（1枠）のため、追加の枠購入はできません。枠の追加は上位プラン（既定2枠・3枠目以降が購入対象）で可能です。
              </div>
            )
          }
          return (
            <form action={createSlotPurchaseAction} className="mb-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
              <input type="hidden" name="member_id" value={member.id} />
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">販売可能枠を購入</span>
                <span className="text-xs text-slate-500">1枠=税抜100,000円＋消費税{mgmtFee.taxPct}%（税込{(100000 + Math.floor(100000 * mgmtFee.taxPct / 100)).toLocaleString()}円）／保有 {currentSlots} 枠・上限10枠（3枠目以降が購入対象）</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">購入枠数 *</label>
                  <input
                    name="slot_count"
                    type="number"
                    min={1}
                    max={remainingSlots || 1}
                    defaultValue={remainingSlots > 0 ? 1 : ''}
                    disabled={remainingSlots === 0}
                    className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <button
                  disabled={remainingSlots === 0}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  枠購入を請求
                </button>
                <p className="text-xs text-slate-500">
                  {remainingSlots === 0
                    ? '既に上限（10枠）に達しています。'
                    : '請求を発行し、入金消込が完了すると自動的に枠が付与されます。枠数に応じて月額管理手数料も増減します。'}
                </p>
              </div>
            </form>
          )
        })()}

        {/* ㊵ 自動売買 枠の資金設定（最低値・最高値）— 加盟者ごとに任意設定・最高値基準で枠カウント */}
        {member.grant_auto && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">自動売買 枠の資金設定（最低値・最高値）</span>
              {autoCap && (
                <span className="text-xs text-slate-500">現在：保有 {autoCap.ownedSlots}枠／有効 <span className={autoCap.effectiveSlots < autoCap.ownedSlots ? 'font-semibold text-amber-700' : 'font-semibold text-slate-700'}>{autoCap.effectiveSlots}枠</span>（予算 {yen(autoCap.autoBalance)}）</span>
              )}
            </div>
            {/* 枠の概念の注釈（権限下位の担当者向け） */}
            <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              <div className="mb-1 font-semibold text-slate-700">枠のしくみ（担当者向けの注釈）</div>
              ・<span className="font-medium text-slate-700">有効枠 ＝ min( 保有枠, 予算 ÷ 最高値 )</span>。枠は<span className="font-medium text-slate-700">「最高値」を基準にカウント</span>します。<br />
              ・<span className="font-medium text-slate-700">最低値</span>＝受注できる最低預かり金。予算がこれ未満だと全枠ロックになります。<br />
              ・<span className="font-medium text-slate-700">最低値＝最高値</span>に揃えると、その金額ごとに1枠（例：どちらも100万・予算200万 → 2枠）。<br />
              ・別々（例：最低100万〜最高400万）なら、枠は最高値＝400万ごとに1枠でカウントします。
            </div>
            <form action={setSlotCapitalAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="member_id" value={member.id} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">最低値（最低預かり金・円）</label>
                <input name="min_deposit" inputMode="numeric" defaultValue={member.auto_min_deposit_yen ?? ''} placeholder={`空欄＝全体設定（${(autoSettings?.minDeposit ?? 0).toLocaleString()}円）`} className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">最高値（1枠あたり運用資金・円）*</label>
                <input name="max_capital" inputMode="numeric" defaultValue={member.capital_per_slot_yen ?? ''} className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">保存</button>
            </form>
            {autoCap && autoCap.capitalLimited && (
              <p className="mt-2 text-[11px] text-amber-600">現在、預かり金が不足しているため有効枠が保有枠より少なくなっています（あと {yen(autoCap.nextSlotShortfallYen)} の入金で次の1枠が有効になります）。</p>
            )}
          </div>
        )}

        {/* 月額管理手数料（枠数連動・本部が月次で相殺／請求）— 2026-07-21 改定 */}
        {member.grant_auto && mgmtFee.eligible && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">月額管理手数料（月次）</span>
              <span className="text-xs text-slate-500">
                月額（税抜）=（枠数−1）× {yen(mgmtFee.unit)} ／ 現在 {mgmtFee.slots}枠 = <span className="font-medium text-slate-700">{yen(mgmtFee.monthlyFee)}</span>
                ＋消費税{mgmtFee.taxPct}% {yen(mgmtFee.monthlyTax)} ＝ <span className="font-semibold text-amber-700">税込 {yen(mgmtFee.monthlyFeeIncl)}</span>/月
              </span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
              <div>起算日<div className="font-medium text-slate-800">{mgmtFee.anchor ?? '未設定'}</div></div>
              <div>課金済み<div className="font-medium text-slate-800">{mgmtFee.billedMonths} か月</div></div>
              <div>今回課金可能<div className="font-medium text-slate-800">{mgmtFee.dueMonths} か月 = 税込 {yen(mgmtFee.dueGrossIncl)}<span className="ml-1 text-[10px] text-slate-400">（税抜{yen(mgmtFee.dueGross)}＋税{yen(mgmtFee.dueTax)}）</span></div></div>
              <div>預かり金残高<div className="font-medium text-slate-800">{yen(mgmtFee.balance)}</div></div>
            </div>
            <form action={runMemberMgmtFeeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="member_id" value={member.id} />
              <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">今月分を相殺／請求する</button>
              <span className="text-xs text-slate-500">満了月分を預かり金から相殺し、不足は請求（デポジット依頼）＋通知します。</span>
            </form>
            {/* #33 自動引き落とし（満了月ごとに自動清算） */}
            <form action={setMgmtFeeAutoAction} className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-100 pt-2">
              <input type="hidden" name="member_id" value={member.id} />
              <input type="hidden" name="on" value={member.mgmt_fee_auto ? '0' : '1'} />
              <span className="text-xs text-slate-600">自動引き落とし：<span className={member.mgmt_fee_auto ? 'font-semibold text-green-700' : 'text-slate-400'}>{member.mgmt_fee_auto ? 'ON（満了月ごとに自動清算）' : 'OFF（手動のみ）'}</span></span>
              <button className="rounded-lg border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">{member.mgmt_fee_auto ? 'OFFにする' : 'ONにする'}</button>
            </form>
            {mgmtFeeRuns.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-amber-100 pt-2">
                <div className="text-[11px] font-medium text-slate-500">実行履歴</div>
                {mgmtFeeRuns.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-600">
                    <span className="text-slate-400">{new Date(r.created_at).toLocaleDateString('ja-JP')}</span>
                    <span>{r.months}か月・{r.slots}枠</span>
                    <span>税込 {yen(r.gross_yen + r.tax_yen)}<span className="ml-1 text-slate-400">（税抜{yen(r.gross_yen)}＋税{yen(r.tax_yen)}）</span></span>
                    <span className="text-green-700">預かり金 {yen(r.from_deposit_yen)}</span>
                    {r.invoiced_yen > 0 && <span className="text-amber-700">請求 {yen(r.invoiced_yen)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 請求を作成 */}
        <form action={createInvoiceAction} className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="member_id" value={member.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">費目 *</label>
              <select name="kind" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {Object.entries(INVOICE_KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">請求額（円）*</label>
              <input name="amount" inputMode="numeric" required placeholder="100000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">支払期限</label>
              <input type="date" name="due_date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">件名（任意）</label>
              <input name="title" placeholder="2026年7月分 など" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name="requested" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-500" />
              作成と同時に「請求済」にする（加盟店に表示されます）
            </label>
            <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">請求を追加</button>
          </div>
        </form>

        {/* 請求一覧（消込状況） */}
        <div className="space-y-3">
          {invoices.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">請求はまだありません。</p>
          )}
          {invoices.map((inv) => {
            const remaining = Math.max(0, inv.amount_yen - inv.paid_yen)
            const pct = inv.amount_yen > 0 ? Math.min(100, Math.round((inv.paid_yen / inv.amount_yen) * 100)) : 0
            const done = inv.status === 'paid' || inv.status === 'cancelled'
            return (
              <div key={inv.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{INVOICE_KIND_LABEL[inv.kind]}</span>
                  {inv.title && <span className="text-xs text-slate-500">{inv.title}</span>}
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${INVOICE_STATUS_TONE[inv.status]}`}>{INVOICE_STATUS_LABEL[inv.status]}</span>
                  {inv.due_date && (
                    <span className={`text-[11px] ${inv.status === 'overdue' ? 'font-semibold text-red-600' : 'text-slate-400'}`}>期限 {inv.due_date}</span>
                  )}
                  <span className="ml-auto text-sm text-slate-700">
                    <span className="font-semibold text-green-700">{yen(inv.paid_yen)}</span> / {yen(inv.amount_yen)}
                    {remaining > 0 && inv.status !== 'cancelled' && <span className="ml-2 text-amber-700">残 {yen(remaining)}</span>}
                  </span>
                </div>

                {/* 消込プログレス */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${inv.status === 'overdue' ? 'bg-red-400' : done ? 'bg-green-500' : 'bg-brand-400'}`} style={{ width: `${pct}%` }} />
                </div>

                {/* 消込内訳（入金明細） */}
                {(invoicePayments.get(inv.id) ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(invoicePayments.get(inv.id) ?? []).map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-xs text-slate-500">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {p.payment_date} 入金 <span className="font-medium text-slate-700">{yen(p.amount_yen)}</span>
                        {p.note && <span className="text-slate-400">（{p.note}）</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {/* 操作：消込（入金記録）・請求発行・取消 */}
                {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <form action={recordPaymentAction} className="flex items-end gap-2">
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <input type="hidden" name="member_id" value={member.id} />
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-500">入金額（消込）</label>
                        <input name="amount" inputMode="numeric" required defaultValue={remaining || ''} placeholder="金額" className="w-32 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-500">入金日</label>
                        <input type="date" name="payment_date" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                      </div>
                      <button className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">消込する</button>
                    </form>
                    {inv.status === 'unbilled' && (
                      <form action={markBilledAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <input type="hidden" name="member_id" value={member.id} />
                        <button className="rounded-lg border border-info-300 px-3 py-1.5 text-xs font-medium text-info-700 hover:bg-info-50">請求を発行</button>
                      </form>
                    )}
                    <form action={cancelInvoiceAction} className="ml-auto">
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="member_id" value={member.id} />
                      <button className="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-600">取消</button>
                    </form>
                  </div>
                )}
                {(inv.status === 'cancelled' || inv.status === 'paid') && (
                  <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
                    <form action={deleteInvoiceAction}>
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="member_id" value={member.id} />
                      <button className="text-xs text-slate-400 hover:text-red-600">削除</button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 入金履歴（すべての入金）#26：デポジット入金＋加盟金/月額を統合表示 */}
      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">入金履歴（すべての入金）</h2>
        <p className="mb-3 text-xs text-slate-500">仕入れ資金のデポジット入金と、加盟金・月額などの入金を時系列でまとめて表示します。</p>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">日付</th>
                <th className="px-4 py-2 font-medium">種別</th>
                <th className="px-4 py-2 font-medium">金額</th>
                <th className="px-4 py-2 font-medium">状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incoming.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    入金履歴はありません。
                  </td>
                </tr>
              )}
              {incoming.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-slate-700">{r.date}</td>
                  <td className="px-4 py-2 text-slate-700">{r.kindLabel}{r.note ? <span className="ml-2 text-xs text-slate-400">{r.note}</span> : null}</td>
                  <td className="px-4 py-2 font-medium text-emerald-700">＋{yen(r.amount)}</td>
                  <td className="px-4 py-2 text-slate-700">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 監査ログ（削除・復元など重要操作）migration 048 */}
      {auditLogs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-slate-500" /> 操作ログ（監査）
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <ul className="space-y-2">
              {auditLogs.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-xs text-slate-600">
                  <Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  <span className="text-slate-400">{new Date(a.created_at).toLocaleString('ja-JP')}</span>
                  <span className="font-medium text-slate-800">{a.action === 'member.delete' ? '削除' : a.action === 'member.restore' ? '復元' : a.action}</span>
                  <span>{a.detail}</span>
                  {a.actor_name && <span className="text-slate-400">by {a.actor_name}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 危険な操作：会員登録の削除（ソフト削除・復元可）#11/#16 */}
      {!member.deleted_at && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
            <XCircle className="h-4 w-4" /> 会員登録の削除
          </h2>
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
            <p className="text-xs text-slate-600">
              この会員を一覧から削除します。<span className="font-medium text-slate-800">物理削除ではなくソフト削除</span>のため、
              入出金・同意記録などは保全され、あとから<span className="font-medium">「復元」</span>できます。操作は監査ログに記録されます。
            </p>
            <form action={softDeleteMemberAction} className="mt-3">
              <input type="hidden" name="id" value={member.id} />
              <ConfirmSubmit
                message={`「${member.company_name ?? member.member_name}」の会員登録を削除します。よろしいですか？（あとから復元できます）`}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                この会員を削除する
              </ConfirmSubmit>
            </form>
          </div>
        </section>
      )}
    </div>
  )
}
