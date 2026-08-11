import type { ProviderId } from './providers/types'
import type { AiModelTier } from '@/types/database'

/**
 * 回答グレード（light/standard/premium）→ 各プロバイダのモデルIDへのマッピング。
 * 既定プロバイダは Claude。standard がプランの標準（コスト・実用のバランス）。
 */
const MODEL_MAP: Record<ProviderId, Record<AiModelTier, string>> = {
  claude: { light: 'claude-haiku-4-5', standard: 'claude-sonnet-4-6', premium: 'claude-opus-4-8' },
  openai: { light: 'gpt-4o-mini', standard: 'gpt-4o', premium: 'gpt-4o' },
  gemini: { light: 'gemini-2.5-flash', standard: 'gemini-2.5-flash', premium: 'gemini-2.5-pro' },
}

export function modelForTier(provider: ProviderId, tier: AiModelTier): string {
  return MODEL_MAP[provider][tier]
}
