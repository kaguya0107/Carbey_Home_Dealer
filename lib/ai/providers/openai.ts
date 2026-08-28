/**
 * OpenAI GPT プロバイダ実装。
 * モデル: gpt-4o 固定 (Tool Use 安定、日本語精度高、コストバランス良)。
 *
 * OpenAI Chat Completions API は Claude と形が違う:
 *   - 「tool_call」は assistant メッセージ内の tool_calls 配列
 *   - 「tool_result」は role: 'tool' メッセージで tool_call_id 必須
 *   - system は messages 配列の先頭に 1 要素として入れる
 */
import OpenAI from 'openai'

import type {
  AIChatRequest,
  AIChatResponse,
  AIChatTurn,
  AIProvider,
  AIToolCall,
  StreamEvent,
} from './types'

const MODEL = 'gpt-4o'

function client(): OpenAI {
  return new OpenAI()
}

/** AIChatTurn[] を OpenAI ChatCompletionMessageParam[] に変換 */
function toOpenAIMessages(
  systemPrompt: string,
  history: AIChatTurn[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]
  for (const t of history) {
    if (t.role === 'user') {
      // ⑲ 画像添付（スクショ等）があれば vision 用の content 配列で送る（gpt-4o はマルチモーダル）。
      if (t.images && t.images.length > 0) {
        out.push({
          role: 'user',
          content: [
            ...(t.content ? [{ type: 'text' as const, text: t.content }] : []),
            ...t.images.map((img) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${img.media_type};base64,${img.data}` },
            })),
          ],
        })
      } else {
        out.push({ role: 'user', content: t.content })
      }
    } else if (t.role === 'assistant') {
      if (t.tool_calls && t.tool_calls.length > 0) {
        out.push({
          role: 'assistant',
          content: t.content || null,
          tool_calls: t.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          })),
        })
      } else {
        out.push({ role: 'assistant', content: t.content })
      }
    } else if (t.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: t.tool_call_id,
        content: JSON.stringify(t.content),
      })
    }
  }
  return out
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  displayName: 'OpenAI (GPT-4o)',
  model: MODEL,

  isConfigured() {
    return !!process.env.OPENAI_API_KEY
  },

  async chat(req: AIChatRequest): Promise<AIChatResponse> {
    const resp = await client().chat.completions.create({
      model: req.model ?? MODEL,
      max_tokens: req.maxOutputTokens ?? 2048,
      messages: toOpenAIMessages(req.systemPrompt, req.history),
      tools: req.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    })

    const choice = resp.choices[0]
    const msg = choice.message

    const text = msg.content?.trim() || null

    const tool_calls: AIToolCall[] = (msg.tool_calls ?? [])
      .filter(
        (tc): tc is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function' } =>
          tc.type === 'function',
      )
      .map((tc) => {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(tc.function.arguments)
        } catch {
          // 不正な JSON ならそのままエラー文字列を渡す
          parsed = { _raw_arguments: tc.function.arguments }
        }
        return {
          id: tc.id,
          name: tc.function.name,
          input: parsed,
        }
      })

    let stop_reason: AIChatResponse['stop_reason'] = 'other'
    if (choice.finish_reason === 'stop') stop_reason = 'end_turn'
    else if (choice.finish_reason === 'tool_calls') stop_reason = 'tool_use'
    else if (choice.finish_reason === 'length') stop_reason = 'max_tokens'

    return {
      text,
      tool_calls,
      usage: {
        input_tokens: resp.usage?.prompt_tokens,
        output_tokens: resp.usage?.completion_tokens,
      },
      stop_reason,
    }
  },

  async *chatStream(req: AIChatRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const stream = await client().chat.completions.create({
      model: req.model ?? MODEL,
      max_tokens: req.maxOutputTokens ?? 2048,
      messages: toOpenAIMessages(req.systemPrompt, req.history),
      tools: req.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
      stream: true,
      stream_options: { include_usage: true },
    })

    let textBuf = ''
    let finishReason: string | null = null
    let usagePrompt: number | undefined
    let usageCompletion: number | undefined
    // OpenAI ストリームの tool_calls は index 単位で部分配信されるため、
    // index → {id, name, argsBuf} で蓄積
    const partialTools = new Map<
      number,
      { id: string; name: string; args: string }
    >()

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0]
      if (choice) {
        const delta = choice.delta
        if (delta?.content) {
          textBuf += delta.content
          yield { type: 'text_delta', delta: delta.content }
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!partialTools.has(idx)) {
              partialTools.set(idx, { id: '', name: '', args: '' })
            }
            const cur = partialTools.get(idx)!
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name = tc.function.name
            if (tc.function?.arguments) cur.args += tc.function.arguments
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
      if (chunk.usage) {
        usagePrompt = chunk.usage.prompt_tokens
        usageCompletion = chunk.usage.completion_tokens
      }
    }

    const tool_calls: AIToolCall[] = [...partialTools.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, t]) => {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(t.args)
        } catch {
          parsed = { _raw_arguments: t.args }
        }
        return {
          id: t.id || `call_${idx}`,
          name: t.name,
          input: parsed,
        }
      })

    let stop_reason: AIChatResponse['stop_reason'] = 'other'
    if (finishReason === 'stop') stop_reason = 'end_turn'
    else if (finishReason === 'tool_calls') stop_reason = 'tool_use'
    else if (finishReason === 'length') stop_reason = 'max_tokens'

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
