'use server'

import { requireStaff } from '@/lib/auth/session'
import { analyzeScope, type ScopeFilter, type ScopeResult } from '@/lib/portal/market-analysis'

export async function runAnalysisAction(
  filter: ScopeFilter,
): Promise<{ ok: true; result: ScopeResult } | { ok: false; error: string }> {
  await requireStaff()
  try {
    const result = await analyzeScope(filter)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '集計に失敗しました。' }
  }
}
