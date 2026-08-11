import { createServiceRoleClient } from '@/lib/supabase/admin'
import { resolveFlow, canSwitchFlow, type ModelGrants } from '@/lib/portal/flow'
import { computeAntiqueGrace } from '@/lib/portal/trading'
import { listOnboardingTasks, buildOnboardingView, syncOnboardingStatus } from '@/lib/portal/onboarding'
import type { FlowType } from '@/types/database'

/**
 * 加盟店ごとの「利用可能機能」を集約する（レビュー㉕）。
 * 手動の個別権限ではなく、保有権限・フロー・オンボーディング完了・古物商猶予から
 * 実効的に何が使えるかを自動判定して可視化する（自動化方針と整合）。
 *
 * レビュー④：運用方式はプランではなく会員ごとの権限（grant_semi / grant_auto）で判定する。
 * レビュー⑤：オンボーディング完了は「必須タスクがすべて done」で判定する。
 *   （members.onboarding_done は任意タスク＝古物商も数に含むため、実際のオーダー可否と
 *     食い違っていた。オーダー側の判定 buildOnboardingView().unlocked に揃える）
 */

export type MemberCapability = {
  key: string
  label: string
  /** 利用可否 */
  allowed: boolean
  /** 制限中の理由（allowed=false のとき） */
  reason?: string
}

export type MemberCapabilities = {
  planName: string | null
  hasSemi: boolean
  hasAuto: boolean
  flow: FlowType
  canSwitchFlow: boolean
  onboardingDone: boolean
  onboardingPct: number
  tradingAllowed: boolean
  antiqueState: 'ok' | 'warning' | 'expired' | 'approved'
  capabilities: MemberCapability[]
}

type MemberRow = {
  id: string
  contract_date: string | null
  active_flow: FlowType | null
  grant_semi: boolean
  grant_auto: boolean
  trading_override: boolean
  plan: { name: string } | null
}

/** member.id から利用可能機能を集約。 */
export async function getMemberCapabilities(memberId: string): Promise<MemberCapabilities | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id, contract_date, active_flow, grant_semi, grant_auto, trading_override, plan:plans(name)')
    .eq('id', memberId)
    .maybeSingle<MemberRow>()
  if (!member) return null

  const grants: ModelGrants = { grant_semi: member.grant_semi, grant_auto: member.grant_auto }
  const hasSemi = grants.grant_semi
  const hasAuto = grants.grant_auto
  const flow = resolveFlow(grants, member.active_flow)

  // 実体（本人確認/資金/規約/マニュアル）に合わせて先に同期してから読む。
  // これをしないと、規約の新版公開後などに本部側の表示が古いままになる（レビュー⑥）。
  await syncOnboardingStatus(memberId)
  const tasks = await listOnboardingTasks(memberId)
  const view = buildOnboardingView(tasks)
  const onboardingPct = view.pct
  // 必須タスクがすべて完了か（任意の古物商は解放をブロックしない）＝オーダー側と同一判定
  const onboardingDone = view.unlocked

  // 古物商が承認済みかは evidences を見る（取引ロック判定に必要）
  const { data: antique } = await supabase
    .from('evidences')
    .select('id')
    .eq('member_id', memberId)
    .eq('kind', 'antique_license')
    .eq('status', 'approved')
    .limit(1)
  const grace = computeAntiqueGrace(member.contract_date, (antique?.length ?? 0) > 0)

  // 実効的な利用可能機能（権限・フロー・完了・猶予から自動判定）
  const capabilities: MemberCapability[] = [
    {
      key: 'flow_semi',
      label: '半自動売買フロー（セミオート）',
      allowed: hasSemi,
      reason: hasSemi ? undefined : 'セミオートの権限が割り当てられていません',
    },
    {
      key: 'flow_auto',
      label: '自動売買フロー（フルオート）',
      allowed: hasAuto,
      reason: hasAuto ? undefined : 'フルオートの権限が割り当てられていません',
    },
    {
      key: 'flow_switch',
      label: '売買フローの切り替え',
      allowed: canSwitchFlow(grants),
      reason: canSwitchFlow(grants) ? undefined : '両方（セミオート・フルオート）の権限が必要です',
    },
    {
      key: 'trading',
      // ㉕ 本部が手動で許可した場合はオンボーディング未完了でも取引可
      //    （古物商猶予の超過ロックは法令順守のため解除しない）
      label: member.trading_override ? '仕入れオーダー（取引）※本部が特例で許可' : '仕入れオーダー（取引）',
      allowed: (onboardingDone || member.trading_override) && grace.tradingAllowed,
      reason: !grace.tradingAllowed
        ? '古物商許可証の提出期限を超過（特例でも解除されません）'
        : !onboardingDone && !member.trading_override
          ? 'オンボーディング未完了'
          : undefined,
    },
    {
      key: 'self_manage',
      label: '本人情報・資金管理',
      allowed: true, // 常時利用可
    },
    {
      key: 'ai',
      label: 'AI分析',
      allowed: true, // 権限任意。取引ロック中も継続利用可
    },
  ]

  return {
    planName: member.plan?.name ?? null,
    hasSemi,
    hasAuto,
    flow,
    canSwitchFlow: canSwitchFlow(grants),
    onboardingDone,
    onboardingPct,
    tradingAllowed: grace.tradingAllowed,
    antiqueState: grace.state,
    capabilities,
  }
}
