import { createServiceRoleClient } from '@/lib/supabase/admin'
import { getEffectiveAiConfig, getCarriedIn, getRemainingSearches, ymOf } from './ai-config'
import type { AiScope, AiUsageKind } from '@/types/database'

/**
 * Phase 4 AI：使用量メータリング。
 * ・検索(kind='search')のみ月間割当を消費（原子的関数 ai_reserve_search）。
 * ・画像/書面生成/ディープは従量。割当は減らさず台帳にのみ記録。
 * ・呼び出し前に assertQuota（UX）、成功後に consumeSearch（権威・原子的）。
 */

/** 1検索あたりの名目単価（円）。実原価はトークンから別途集計。 */
export const AI_UNIT_COST_YEN = 10

export class AiQuotaError extends Error {
  constructor() {
    super('AI_QUOTA_EXCEEDED')
    this.name = 'AiQuotaError'
  }
}

/** 呼び出し前の残数チェック（UX 用の事前判定）。本部AI(null)は無制限。 */
export async function assertQuota(memberId: string | null): Promise<void> {
  if (!memberId) return
  const { remaining } = await getRemainingSearches(memberId)
  if (remaining !== null && remaining <= 0) throw new AiQuotaError()
}

/**
 * 検索1回を原子的に消費（回答成功後に呼ぶ）。消費後の残数を返す（null=無制限）。
 * 残数不足なら AiQuotaError。
 */
export async function consumeSearch(memberId: string | null, ym: string = ymOf()): Promise<number | null> {
  if (!memberId) return null
  const config = await getEffectiveAiConfig(memberId)
  if (config.monthlySearches === null) return null

  const carriedIn = await getCarriedIn(memberId, ym, config.carryOver)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('ai_reserve_search', {
    p_member: memberId,
    p_ym: ym,
    p_allocated: config.monthlySearches,
    p_carried_in: carriedIn,
  } as never)

  if (error) {
    if (/AI_QUOTA_EXCEEDED/.test(error.message)) throw new AiQuotaError()
    throw new Error(error.message)
  }
  return typeof data === 'number' ? data : null
}

/** 利用台帳に1件記録（検索・従量いずれも）。会計・監視の源泉。 */
export async function recordUsage(entry: {
  memberId: string | null
  scope: AiScope
  kind: AiUsageKind
  modelTier?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  conversationId?: string | null
  unitCostYen?: number | null
}): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('ai_usage_ledger').insert({
    member_id: entry.memberId,
    scope: entry.scope,
    kind: entry.kind,
    model_tier: entry.modelTier ?? null,
    unit_cost_yen: entry.unitCostYen ?? (entry.kind === 'search' ? AI_UNIT_COST_YEN : null),
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    conversation_id: entry.conversationId ?? null,
  } as never)
  if (error) throw new Error(error.message)
}

/** 加盟者ごとの「検索・蓄積」を1件保存（共通のカーセンサー市場データの上に載る）。 */
export async function saveSearch(memberId: string, query: string, params: unknown, resultRef?: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('ai_saved_searches').insert({
    member_id: memberId,
    query,
    params: params ?? null,
    result_ref: resultRef ?? null,
  } as never)
  if (error) throw new Error(error.message)
}
