import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getRemainingSearches, ymOf } from './ai-config'

/**
 * Phase 4 AI：本部の使用量ダッシュボード用の集計。
 * feature_ai 有効プランの在籍加盟店ごとに、当月の割当・残・使用・繰越・原価をまとめる。
 */

export type MemberAiUsageRow = {
  memberId: string
  name: string
  company: string | null
  allocated: number | null
  remaining: number | null
  used: number
  carriedIn: number
  searches: number
  costYen: number
}

type MemberPick = {
  id: string
  member_name: string | null
  company_name: string | null
  plan: { feature_ai: boolean } | null
}

type LedgerPick = { member_id: string | null; kind: string; unit_cost_yen: number | null }

export async function listMemberAiUsage(ym: string = ymOf()): Promise<{ rows: MemberAiUsageRow[]; totalCostYen: number; ym: string }> {
  const sb = createServiceRoleClient()

  const { data: members } = await sb
    .from('members')
    .select('id, member_name, company_name, plan:plans(feature_ai)')
    .is('deleted_at', null)
    .order('member_name', { ascending: true })

  const aiMembers = ((members ?? []) as unknown as MemberPick[]).filter((m) => m.plan?.feature_ai)

  // 当月の台帳を一括取得し JS 集計（member_id → { searches, cost }）
  const { data: ledger } = await sb
    .from('ai_usage_ledger')
    .select('member_id, kind, unit_cost_yen')
    .gte('created_at', `${ym}-01`)

  const agg = new Map<string, { searches: number; cost: number }>()
  for (const l of (ledger ?? []) as unknown as LedgerPick[]) {
    if (!l.member_id) continue
    const a = agg.get(l.member_id) ?? { searches: 0, cost: 0 }
    if (l.kind === 'search') a.searches += 1
    a.cost += l.unit_cost_yen ?? 0
    agg.set(l.member_id, a)
  }

  const rows: MemberAiUsageRow[] = []
  for (const m of aiMembers) {
    const rem = await getRemainingSearches(m.id, ym)
    const a = agg.get(m.id) ?? { searches: 0, cost: 0 }
    rows.push({
      memberId: m.id,
      name: m.member_name ?? '—',
      company: m.company_name,
      allocated: rem.allocated,
      remaining: rem.remaining,
      used: rem.used,
      carriedIn: rem.carriedIn,
      searches: a.searches,
      costYen: a.cost,
    })
  }

  const totalCostYen = rows.reduce((s, r) => s + r.costYen, 0)
  return { rows, totalCostYen, ym }
}
