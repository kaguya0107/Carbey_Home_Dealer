/**
 * Google Gemini プロバイダ実装。
 * モデル: gemini-2.5-flash (速い・コスト低・Tool Use対応)
 *
 * Gemini Function Calling API は:
 *   - tools[].functionDeclarations[] で関数定義 (parametersJsonSchema は JSON Schema)
 *   - 履歴は contents[] 配列で parts[] にテキスト or functionCall/functionResponse を入れる
 *   - role は 'user' | 'model' (assistant相当)
 */
import { GoogleGenAI } from '@google/genai'

import type {
  AIChatRequest,
  AIChatResponse,
  AIChatTurn,
  AIProvider,
  AIToolCall,
  StreamEvent,
} from './types'

const MODEL = 'gemini-2.5-flash'

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
}

/** AIChatTurn[] → Gemini contents[] */
function toGeminiContents(history: AIChatTurn[]): Array<{
  role: 'user' | 'model'
  parts: Array<Record<string, unknown>>
}> {
  const out: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = []
  for (const t of history) {
    if (t.role === 'user') {
      out.push({ role: 'user', parts: [{ text: t.content }] })
    } else if (t.role === 'assistant') {
      const parts: Array<Record<string, unknown>> = []
      if (t.content) parts.push({ text: t.content })
      for (const tc of t.tool_calls ?? []) {
        parts.push({
          functionCall: {
            // Gemini は id を持たないので name+args を使う
            name: tc.name,
            args: tc.input,
          },
        })
      }
      if (parts.length > 0) out.push({ role: 'model', parts })
    } else if (t.role === 'tool') {
      // Gemini では tool 応答は user ロールの functionResponse parts に
      // tool_call_id は使えず、name でマッチさせる必要がある — 直前assistant の tool_call.name をベースに復元
      // ここでは tool_call_id を解析して name を抜き出す簡易ロジック
      // (tool_call_id を 'name:uuid' 形式にして渡す運用にする)
      const [callName] = String(t.tool_call_id).split(':', 1)
      out.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: callName,
              response: typeof t.content === 'object' ? t.content : { result: t.content },
            },
          },
        ],
      })
    }
  }
  return out
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  displayName: 'Gemini (2.5 Flash)',
  model: MODEL,

  isConfigured() {
    return !!process.env.GEMINI_API_KEY
  },

  async chat(req: AIChatRequest): Promise<AIChatResponse> {
    const ai = client()
    const resp = await ai.models.generateContent({
      model: req.model ?? MODEL,
      contents: toGeminiContents(req.history),
      config: {
        systemInstruction: req.systemPrompt,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        tools: [
          {
            functionDeclarations: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.input_schema,
            })),
          },
        ],
      },
    })

    const text = resp.text?.trim() || null

    const calls = resp.functionCalls ?? []
    const tool_calls: AIToolCall[] = calls.map((c) => {
      const name = c.name ?? 'unknown'
      // 一意ID: name + ランダム短縮 (会話内の呼び出しを識別)
      const id = `${name}:${Math.random().toString(36).slice(2, 10)}`
      return {
        id,
        name,
        input: (c.args ?? {}) as Record<string, unknown>,
      }
    })

    // Geminiの stop_reason は candidates[0].finishReason
    const finish = resp.candidates?.[0]?.finishReason
    let stop_reason: AIChatResponse['stop_reason'] = 'other'
    if (tool_calls.length > 0) stop_reason = 'tool_use'
    else if (finish === 'STOP') stop_reason = 'end_turn'
    else if (finish === 'MAX_TOKENS') stop_reason = 'max_tokens'

    const usage = resp.usageMetadata
    return {
      text,
      tool_calls,
      usage: {
        input_tokens: usage?.promptTokenCount,
        output_tokens: usage?.candidatesTokenCount,
      },
      stop_reason,
    }
  },

  async *chatStream(req: AIChatRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const ai = client()
    const stream = await ai.models.generateContentStream({
      model: req.model ?? MODEL,
      contents: toGeminiContents(req.history),
      config: {
        systemInstruction: req.systemPrompt,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        tools: [
          {
            functionDeclarations: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.input_schema,
            })),
          },
        ],
      },
    })

    let textBuf = ''
    const tool_calls: AIToolCall[] = []
    let usagePrompt: number | undefined
    let usageCompletion: number | undefined
    let finishReason: string | undefined

    for await (const chunk of stream) {
      // テキストデルタ
      const t = chunk.text
      if (t) {
        textBuf += t
        yield { type: 'text_delta', delta: t }
      }
      // functionCalls (1度に複数くる可能性)
      const calls = chunk.functionCalls ?? []
      for (const c of calls) {
        const name = c.name ?? 'unknown'
        tool_calls.push({
          id: `${name}:${Math.random().toString(36).slice(2, 10)}`,
          name,
          input: (c.args ?? {}) as Record<string, unknown>,
        })
      }
      // usage / finish_reason は最後のチャンクに乗ることが多い
      if (chunk.usageMetadata) {
        usagePrompt = chunk.usageMetadata.promptTokenCount
        usageCompletion = chunk.usageMetadata.candidatesTokenCount
      }
      const fr = chunk.candidates?.[0]?.finishReason
      if (fr) finishReason = fr
    }

    let stop_reason: AIChatResponse['stop_reason'] = 'other'
    if (tool_calls.length > 0) stop_reason = 'tool_use'
    else if (finishReason === 'STOP') stop_reason = 'end_turn'
    else if (finishReason === 'MAX_TOKENS') stop_reason = 'max_tokens'

    yield {
      type: 'done',
      response: {
        text: textBuf.trim() || null,
        tool_calls,
        usage: {
          input_tokens: usagePrompt,
          output_tokens: usageCompletion,
        },
        stop_reason,
      },
    }
  },
}
