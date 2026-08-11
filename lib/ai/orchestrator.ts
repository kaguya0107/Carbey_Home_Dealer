import { getProvider, DEFAULT_PROVIDER } from './providers/registry'
import type { ProviderId, AIChatTurn, AITool } from './providers/types'
import { executeTool, type Evidence } from './executeTool'

/**
 * tool-use ループ（非ストリーム）。
 * プロバイダに問い合わせ→tool_use があれば executeTool で実行→結果を履歴に積んで再問い合わせ、
 * を tool_use が止まる（end_turn）まで繰り返す。上限に達したら打ち切る。
 * 使用量（トークン）と根拠（evidence）を集約して返す。
 */

export type RunResult = {
  text: string
  evidence: Evidence[]
  usage: { input_tokens: number; output_tokens: number }
  model: string
  provider: ProviderId
}

export async function runChat(opts: {
  providerId?: ProviderId
  model?: string
  systemPrompt: string
  tools: AITool[]
  /** 直近のユーザー発言を末尾に含む会話履歴 */
  history: AIChatTurn[]
  maxIterations?: number
}): Promise<RunResult> {
  const providerId = opts.providerId ?? DEFAULT_PROVIDER
  const provider = getProvider(providerId)
  const history: AIChatTurn[] = [...opts.history]
  const evidence: Evidence[] = []
  let inTok = 0
  let outTok = 0
  const maxIter = opts.maxIterations ?? 6
  const model = opts.model ?? provider.model

  for (let i = 0; i < maxIter; i++) {
    const res = await provider.chat({
      systemPrompt: opts.systemPrompt,
      tools: opts.tools,
      history,
      model: opts.model,
    })
    inTok += res.usage.input_tokens ?? 0
    outTok += res.usage.output_tokens ?? 0

    if (res.tool_calls.length === 0) {
      return { text: res.text ?? '', evidence, usage: { input_tokens: inTok, output_tokens: outTok }, model, provider: providerId }
    }

    // assistant の tool_use ターンを履歴へ
    history.push({ role: 'assistant', content: res.text ?? '', tool_calls: res.tool_calls })

    // 各ツールを実行し、結果ターンを履歴へ
    for (const call of res.tool_calls) {
      let result: unknown
      try {
        const exec = await executeTool(call.name, call.input)
        result = exec.result
        evidence.push(exec.evidence)
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) }
      }
      history.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }

  // 上限到達（ツール呼び出しが収束しなかった）
  return {
    text: '（分析ツールの呼び出しが上限に達しました。質問を分けてもう一度お試しください。）',
    evidence,
    usage: { input_tokens: inTok, output_tokens: outTok },
    model,
    provider: providerId,
  }
}
