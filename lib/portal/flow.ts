import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { FlowType } from '@/types/database'

/**
 * 加盟店の実行フローに関するロジック（レビュー⑳／④で権限ベースに変更）。
 *
 * レビュー④：運用方式（セミオート/フルオート）はプランのプルダウンに従属させず、
 * 会員ごとの権限（members.grant_semi / grant_auto）で決める。
 * 「セミオート権限」「フルオート権限」「両方」の3パターンを本部が割り当てる。
 * プランの has_semi / has_auto は新規割当時の既定値としてのみ使う。
 */

/** 会員が保有する運用方式の権限。 */
export type ModelGrants = { grant_semi: boolean; grant_auto: boolean }

/** 両方の権限を持つか（＝加盟店がフローを切り替えられる）。 */
export function canSwitchFlow(grants: ModelGrants | null | undefined): boolean {
  return !!grants?.grant_semi && !!grants?.grant_auto
}

/**
 * 実効フローを決定する。
 *   - active_flow が設定済みで、その権限を保有していればそれを採用
 *   - 未設定/権限外なら既定を導出：
 *       両方保有 → 'auto'（既定）／auto のみ → 'auto'／semi のみ → 'semi'
 *   - 権限なし → 'semi'（安全側。表示上の既定）
 */
export function resolveFlow(grants: ModelGrants | null | undefined, activeFlow: FlowType | null | undefined): FlowType {
  const hasSemi = !!grants?.grant_semi
  const hasAuto = !!grants?.grant_auto

  // 明示設定が保有権限と整合していれば尊重
  if (activeFlow === 'auto' && hasAuto) return 'auto'
  if (activeFlow === 'semi' && hasSemi) return 'semi'

  // 既定導出
  if (hasAuto) return 'auto'
  if (hasSemi) return 'semi'
  return 'semi'
}

/** 加盟店がそのフローを選べるか（保有権限の範囲内か）。 */
export function isFlowAllowed(grants: ModelGrants | null | undefined, flow: FlowType): boolean {
  if (flow === 'auto') return !!grants?.grant_auto
  if (flow === 'semi') return !!grants?.grant_semi
  return false
}

const MANUAL_TITLE: Record<FlowType, string> = {
  semi: '実践マニュアル（半自動売買）の修了',
  auto: '実践マニュアル（自動売買）の修了',
}

/** user_id から自分の会員・保有権限・実効フローを取得。 */
export async function getOwnFlow(userId: string): Promise<
  { memberId: string; grants: ModelGrants; activeFlow: FlowType | null; flow: FlowType; canSwitch: boolean } | null
> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id, active_flow, grant_semi, grant_auto')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; active_flow: FlowType | null; grant_semi: boolean; grant_auto: boolean }>()
  if (!member) return null
  const grants: ModelGrants = { grant_semi: member.grant_semi, grant_auto: member.grant_auto }
  return {
    memberId: member.id,
    grants,
    activeFlow: member.active_flow,
    flow: resolveFlow(grants, member.active_flow),
    canSwitch: canSwitchFlow(grants),
  }
}

/**
 * 加盟店が実行フローを切り替える（両方の権限を持つ場合のみ）。
 * active_flow を更新し、マニュアルタスク（link_key='manual'）のタイトルを新フローに差し替える。
 * 他タスク・進捗は維持（sync がマニュアル判定を新フロー基準に自動更新）。
 */
export async function switchOwnFlow(userId: string, flow: FlowType): Promise<void> {
  const supabase = createServiceRoleClient()
  const own = await getOwnFlow(userId)
  if (!own) throw new Error('会員情報が紐付いていません')
  if (!own.canSwitch) throw new Error('フローの切り替えには両方（セミオート・フルオート）の権限が必要です')
  if (!isFlowAllowed(own.grants, flow)) throw new Error('選択したフローの利用権限がありません')

  // active_flow 更新
  const { error: mErr } = await supabase.from('members').update({ active_flow: flow } as never).eq('id', own.memberId)
  if (mErr) throw new Error(mErr.message)

  // マニュアルタスクのタイトルを差し替え（存在すれば）
  const { error: tErr } = await supabase
    .from('onboarding_tasks')
    .update({ title: MANUAL_TITLE[flow] } as never)
    .eq('member_id', own.memberId)
    .eq('link_key', 'manual')
  if (tErr) throw new Error(tErr.message)

  // 実体に合わせて再同期（新フローのマニュアル判定に更新）
  await supabase.rpc('sync_onboarding_status', { p_member_id: own.memberId } as never)
}
