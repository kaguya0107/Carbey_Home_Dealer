import { createServiceRoleClient } from '@/lib/supabase/admin'

/**
 * 古物商許可の猶予・取引可否ロジック（フェーズ⑥-1）。
 * クライアント確定（2026-07-10, docs/onboarding-redesign.md §7-8）:
 *   - 未取得でもスタート可。猶予は「契約日(contract_date)起算で6ヶ月」。
 *   - 期限前30日を切ると事前警告（黄）、超過すると取引ロック（赤）。
 *   - ロック対象は取引動線（オーダー作成・半自動売買）のみ。
 *     本人情報入力・仕入れ資金など自己管理系・AI分析はロックしない。
 *   - 古物商が承認済みなら常に ok（期限は無関係）。
 */

/** 猶予期間（月）。 */
export const ANTIQUE_GRACE_MONTHS = 6
/** 事前警告に入る残日数のしきい値。 */
export const ANTIQUE_WARNING_DAYS = 30

export type AntiqueGraceState = 'ok' | 'warning' | 'expired' | 'approved'

export type AntiqueGrace = {
  state: AntiqueGraceState
  /** 猶予の起算日（契約日）。null=契約日未設定で猶予未開始 */
  startDate: string | null
  /** 猶予の期限日（起算日+6ヶ月）。null=未開始 */
  dueDate: string | null
  /** 期限までの残日数（負値=超過）。null=未開始/承認済み */
  daysLeft: number | null
  /** 取引（オーダー作成・半自動売買）が許可されるか。 */
  tradingAllowed: boolean
}

/** contract_date に n ヶ月を加算した日付（YYYY-MM-DD）。 */
function addMonths(dateStr: string, months: number): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * 契約日と古物商承認状況から猶予状態を判定する。
 * @param contractDate members.contract_date（null 可）
 * @param antiqueApproved 古物商(kind=antique_license)が approved か
 */
export function computeAntiqueGrace(
  contractDate: string | null,
  antiqueApproved: boolean,
  now: Date = new Date(),
): AntiqueGrace {
  // 承認済み → 期限に関係なく OK
  if (antiqueApproved) {
    return { state: 'approved', startDate: contractDate, dueDate: null, daysLeft: null, tradingAllowed: true }
  }
  // 契約日未設定 → 猶予未開始（まだ期限が来ない）→ 取引可
  if (!contractDate) {
    return { state: 'ok', startDate: null, dueDate: null, daysLeft: null, tradingAllowed: true }
  }

  const due = addMonths(contractDate, ANTIQUE_GRACE_MONTHS)
  const dueDay = startOfUtcDay(due)
  const today = startOfUtcDay(now)
  const daysLeft = Math.round((dueDay - today) / 86_400_000)
  const dueDate = due.toISOString().slice(0, 10)

  if (daysLeft < 0) {
    return { state: 'expired', startDate: contractDate, dueDate, daysLeft, tradingAllowed: false }
  }
  if (daysLeft <= ANTIQUE_WARNING_DAYS) {
    return { state: 'warning', startDate: contractDate, dueDate, daysLeft, tradingAllowed: true }
  }
  return { state: 'ok', startDate: contractDate, dueDate, daysLeft, tradingAllowed: true }
}

/** member.id から古物商承認済みかを判定。 */
export async function isAntiqueApproved(memberId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('evidences')
    .select('id')
    .eq('member_id', memberId)
    .eq('kind', 'antique_license')
    .eq('status', 'approved')
    .limit(1)
  return (data?.length ?? 0) > 0
}

/** member.id から猶予状態を取得。 */
export async function getAntiqueGrace(memberId: string, contractDate: string | null): Promise<AntiqueGrace> {
  const approved = await isAntiqueApproved(memberId)
  return computeAntiqueGrace(contractDate, approved)
}

/** user_id（加盟店本人）から猶予状態を取得。member 無しは null。 */
export async function getOwnAntiqueGrace(userId: string): Promise<AntiqueGrace | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id, contract_date')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; contract_date: string | null }>()
  if (!member) return null
  return getAntiqueGrace(member.id, member.contract_date)
}

/**
 * 取引（オーダー作成・半自動売買）の可否を強制するガード。
 * 古物商の猶予超過（expired）なら例外を投げる。呼び出しは発注入口に必須。
 */
export async function assertTradingAllowed(userId: string): Promise<void> {
  const grace = await getOwnAntiqueGrace(userId)
  if (grace && !grace.tradingAllowed) {
    throw new Error('古物商許可証の提出期限を超過しています。許可証をアップロードいただくと取引を再開できます。')
  }
}
