import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { AiModelTier } from '@/types/database'

/**
 * Phase 4 AI：加盟店の実効AI設定（会員上書き → プラン既定）と、月間検索の残数・繰越。
 * 詳細は docs/phase4-ai-implementation-plan.md（Step 1）。
 */

export type AiConfig = {
  /** 月の検索割当。null = 無制限（本部AI） */
  monthlySearches: number | null
  modelTier: AiModelTier
  carryOver: boolean
  imageEnabled: boolean
  docgenEnabled: boolean
  deepEnabled: boolean
}

/** 本部AI（scope='hq'）の既定：無制限・最上位・全機能。 */
const HQ_CONFIG: AiConfig = {
  monthlySearches: null,
  modelTier: 'premium',
  carryOver: false,
  imageEnabled: true,
  docgenEnabled: true,
  deepEnabled: true,
}

/** override（会員）が非 null ならそれ、無ければ plan 既定。 */
function pick<T>(override: T | null | undefined, planDefault: T): T {
  return override === null || override === undefined ? planDefault : override
}

type MemberAiRow = {
  ai_monthly_searches: number | null
  ai_model_tier: AiModelTier | null
  ai_carry_over: boolean | null
  ai_image_enabled: boolean | null
  ai_docgen_enabled: boolean | null
  ai_deep_enabled: boolean | null
  plan: {
    ai_monthly_searches: number
    ai_model_tier: AiModelTier
    ai_carry_over: boolean
    ai_image_enabled: boolean
    ai_docgen_enabled: boolean
    ai_deep_enabled: boolean
  } | null
}

/**
 * 加盟店の実効AI設定。memberId=null は本部AI（無制限）。
 * リクエスト内で複数回呼ばれても1会員につき1回だけ問い合わせる（React cache）。
 */
export const getEffectiveAiConfig = cache(async (memberId: string | null): Promise<AiConfig> => {
  if (!memberId) return HQ_CONFIG

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('members')
    .select(
      'ai_monthly_searches, ai_model_tier, ai_carry_over, ai_image_enabled, ai_docgen_enabled, ai_deep_enabled, ' +
        'plan:plans(ai_monthly_searches, ai_model_tier, ai_carry_over, ai_image_enabled, ai_docgen_enabled, ai_deep_enabled)',
    )
    .eq('id', memberId)
    .maybeSingle<MemberAiRow>()

  const plan = data?.plan
  // プラン未設定なら安全側（割当0＝実質ロック、標準グレード、拡張オフ）
  const base = plan ?? {
    ai_monthly_searches: 0,
    ai_model_tier: 'standard' as AiModelTier,
    ai_carry_over: true,
    ai_image_enabled: false,
    ai_docgen_enabled: false,
    ai_deep_enabled: false,
  }

  return {
    monthlySearches: pick(data?.ai_monthly_searches, base.ai_monthly_searches),
    modelTier: pick(data?.ai_model_tier, base.ai_model_tier),
    carryOver: pick(data?.ai_carry_over, base.ai_carry_over),
    imageEnabled: pick(data?.ai_image_enabled, base.ai_image_enabled),
    docgenEnabled: pick(data?.ai_docgen_enabled, base.ai_docgen_enabled),
    deepEnabled: pick(data?.ai_deep_enabled, base.ai_deep_enabled),
  }
})

// ---------------------------------------------------------------------
// ⑫ 加盟者のAIプロンプト（自由記述の指示）
// ---------------------------------------------------------------------

/** 加盟者が設定したAIへの指示（未設定なら空文字）。 */
export async function getMemberAiInstructions(memberId: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('members')
    .select('ai_custom_instructions')
    .eq('id', memberId)
    .maybeSingle<{ ai_custom_instructions: string | null }>()
  return data?.ai_custom_instructions ?? ''
}

/** 加盟者のAIへの指示を保存（空なら null）。 */
export async function setMemberAiInstructions(memberId: string, text: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('members')
    .update({ ai_custom_instructions: text.trim() || null } as never)
    .eq('id', memberId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------
// 月・繰越
// ---------------------------------------------------------------------

/** 'YYYY-MM'（Asia/Tokyo）を返す。d 省略で当月。 */
export function ymOf(d: Date = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' の1つ前の月。 */
export function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

type MonthRow = { allocated: number; carried_in: number; used: number }

async function readMonth(memberId: string, ym: string): Promise<MonthRow | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('ai_usage_month')
    .select('allocated, carried_in, used')
    .eq('member_id', memberId)
    .eq('ym', ym)
    .maybeSingle<MonthRow>()
  return data ?? null
}

/**
 * 当月への繰越量。前月の残（allocated+carried_in-used、下限0）を、
 * 現在の設定で carryOver が有効なときだけ繰り越す。
 */
export async function getCarriedIn(memberId: string, ym: string, carryOver: boolean): Promise<number> {
  if (!carryOver) return 0
  const prev = await readMonth(memberId, prevYm(ym))
  if (!prev) return 0
  return Math.max(0, prev.allocated + prev.carried_in - prev.used)
}

export type RemainingInfo = {
  /** null = 無制限（本部AI） */
  remaining: number | null
  allocated: number | null
  carriedIn: number
  used: number
}

/** 当月の残検索回数（実効設定＋前月繰越を都度算出）。 */
export async function getRemainingSearches(memberId: string | null, ym: string = ymOf()): Promise<RemainingInfo> {
  const config = await getEffectiveAiConfig(memberId)
  if (!memberId || config.monthlySearches === null) {
    return { remaining: null, allocated: null, carriedIn: 0, used: 0 }
  }
  const allocated = config.monthlySearches
  const carriedIn = await getCarriedIn(memberId, ym, config.carryOver)
  const month = await readMonth(memberId, ym)
  const used = month?.used ?? 0
  return { remaining: allocated + carriedIn - used, allocated, carriedIn, used }
}
