import { getEffectiveAiConfig } from './ai-config'
import { recordUsage } from './ai-usage'
import type { AiScope, AiUsageKind } from '@/types/database'

/**
 * Phase 4 AI：任意拡張（画像解析・書面生成・ディープ）のゲートと従量メータリング。
 *
 * 確定方針：
 *  ・既定オフ。加盟店ごと（プラン既定＋会員上書き）のトグルで開放。
 *  ・検索の月間割当は消費しない（拡張は「従量」オプション）。台帳に kind 別で記録。
 *  ・単価はβ稼働後の実測で確定（unit_cost_yen は null で保留）。
 */

export type ExpansionKind = 'image' | 'docgen' | 'deep'

export class ExpansionDisabledError extends Error {
  constructor(public kind: ExpansionKind) {
    super(`EXPANSION_DISABLED:${kind}`)
    this.name = 'ExpansionDisabledError'
  }
}

const CONFIG_FIELD: Record<ExpansionKind, 'imageEnabled' | 'docgenEnabled' | 'deepEnabled'> = {
  image: 'imageEnabled',
  docgen: 'docgenEnabled',
  deep: 'deepEnabled',
}

/** 加盟店の拡張可否。memberId=null（本部AI）は常に有効。 */
export async function isExpansionEnabled(memberId: string | null, kind: ExpansionKind): Promise<boolean> {
  if (!memberId) return true
  const cfg = await getEffectiveAiConfig(memberId)
  return cfg[CONFIG_FIELD[kind]]
}

/** 無効なら ExpansionDisabledError。 */
export async function assertExpansion(memberId: string | null, kind: ExpansionKind): Promise<void> {
  if (!(await isExpansionEnabled(memberId, kind))) throw new ExpansionDisabledError(kind)
}

/** 拡張の従量記録（検索割当は消費しない）。単価はβ後確定のため null。 */
export async function recordExpansionUsage(opts: {
  memberId: string | null
  scope: AiScope
  kind: ExpansionKind
  modelTier?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  conversationId?: string | null
}): Promise<void> {
  await recordUsage({
    memberId: opts.memberId,
    scope: opts.scope,
    kind: opts.kind as AiUsageKind,
    modelTier: opts.modelTier ?? null,
    inputTokens: opts.inputTokens ?? null,
    outputTokens: opts.outputTokens ?? null,
    conversationId: opts.conversationId ?? null,
    unitCostYen: null,
  })
}
