/**
 * プロバイダレジストリ。
 * ID で AIProvider 実装を取得する単一エントリポイント。
 */
import { claudeProvider } from './claude'
import { geminiProvider } from './gemini'
import { openaiProvider } from './openai'
import type { AIProvider, ProviderId } from './types'

const PROVIDERS: Record<ProviderId, AIProvider> = {
  claude: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
}

export const ALL_PROVIDER_IDS: ProviderId[] = ['claude', 'openai', 'gemini']
// 既定プロバイダ。Anthropic のクレジット追加後に 'claude' へ戻せる。
export const DEFAULT_PROVIDER: ProviderId = 'openai'

export function getProvider(id: ProviderId): AIProvider {
  const p = PROVIDERS[id]
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

/** UIに渡す軽量メタ情報 (displayName + 設定済みフラグ) */
export type ProviderMeta = {
  id: ProviderId
  displayName: string
  model: string
  configured: boolean
}

export function listProviderMeta(): ProviderMeta[] {
  return ALL_PROVIDER_IDS.map((id) => {
    const p = PROVIDERS[id]
    return {
      id,
      displayName: p.displayName,
      model: p.model,
      configured: p.isConfigured(),
    }
  })
}
