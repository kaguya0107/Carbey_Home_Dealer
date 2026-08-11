import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { PlanRow, PlanInsert } from '@/types/database'

export async function listPlans(includeInactive = true): Promise<PlanRow[]> {
  const supabase = createServiceRoleClient()
  let query = supabase.from('plans').select('*').order('display_order', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as PlanRow[]
}

export async function getPlan(id: string): Promise<PlanRow | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', id)
    .maybeSingle<PlanRow>()
  if (error) throw new Error(error.message)
  return data
}

export async function createPlan(input: PlanInsert): Promise<PlanRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('plans')
    .insert(input as never)
    .select('*')
    .single<PlanRow>()
  if (error) throw new Error(error.message)
  return data
}

export async function updatePlan(id: string, patch: Partial<PlanInsert>): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('plans').update(patch as never).eq('id', id)
  if (error) throw new Error(error.message)
}

/** プランごとの加盟店数（プラン管理⇔加盟店管理の連動表示用）。plan_id → 件数。 */
export async function getPlanMemberCounts(): Promise<Record<string, number>> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('members').select('plan_id')
  if (error) throw new Error(error.message)
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { plan_id: string | null }[]) {
    if (r.plan_id) counts[r.plan_id] = (counts[r.plan_id] ?? 0) + 1
  }
  return counts
}
