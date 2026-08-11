/**
 * Anthropic Claude プロバイダ実装。
 * モデル: claude-sonnet-4-6 固定。
 * プロンプトキャッシュ: system + tools にキャッシュブレークポイント。
 */
import Anthropic from '@anthropic-ai/sdk'

import type {
  AIChatRequest,
  AIChatResponse,
  AIChatTurn,
  AIProvider,
  AIToolCall,
  StreamEvent,
} from './types'

const MODEL = 'claude-sonnet-4-6'

function client(): Anthropic {
  return new Anthropic()
}

/** AIChatTurn[] を Anthropic SDK の MessageParam[] に変換 */
function toAnthropicMessages(history: AIChatTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  for (const t of history) {
    if (t.role === 'user') {
      if (t.images && t.images.length > 0) {
        // 任意拡張：画像解析。画像ブロック＋テキストで送る。
        const blocks: Anthropic.ContentBlockParam[] = t.images.map((img) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: img.data,
          },
        }))
        if (t.content) blocks.push({ type: 'text', text: t.content })
        out.push({ role: 'user', content: blocks })
      } else {
        out.push({ role: 'user', content: t.content })
      }
    } else if (t.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = []
      if (t.content) blocks.push({ type: 'text', text: t.content })
      for (const tc of t.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })
      }
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks })
    } else if (t.role === 'tool') {
      // tool_result は user ロールに乗せる
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: t.tool_call_id,
            content: JSON.stringify(t.content),
          },
        ],
      })
    }
  }
  return out
}

export const claudeProvider: AIProvider = {
  id: 'claude',
  displayName: 'Claude (Sonnet 4.6)',
  model: MODEL,

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY
  },

  async chat(req: AIChatRequest): Promise<AIChatResponse> {
    const resp = await client().messages.create({
      model: req.model ?? MODEL,
      max_tokens: req.maxOutputTokens ?? 2048,
      system: [
        {
          type: 'text',
          text: req.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      messages: toAnthropicMessages(req.history),
    })

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || null

    const tool_calls: AIToolCall[] = resp.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      }))

    let stop_reason: AIChatResponse['stop_reason'] = 'other'
    if (resp.stop_reason === 'end_turn') stop_reason = 'end_turn'
    else if (resp.stop_reason === 'tool_use') stop_reason = 'tool_use'
    else if (resp.stop_reason === 'max_tokens') stop_reason = 'max_tokens'

    return {
      text,
      tool_calls,
      usage: {
        input_tokens: resp.usage.input_tokens,
        output_tokens: resp.usage.output_tokens,
        cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
      },
      stop_reason,
    }
  },

  async *chatStream(req: AIChatRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const stream = client().messages.stream({
      model: req.model ?? MODEL,
      max_tokens: req.maxOutputTokens ?? 2048,
      system: [
        {
          type: 'text',
          text: req.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      messages: toAnthropicMessages(req.history),
    })

    // テキストデルタを順次 yield。queue で同期化する
    const queue: StreamEvent[] = []
    let resolveWait: (() => void) | null = null
    let finished = false

    stream.on('text', (delta) => {
      queue.push({ type: 'text_delta', delta })
      resolveWait?.()
    })
    stream.on('end', () => {
      finished = true
      resolveWait?.()
    })
    stream.on('error', () => {
      finished = true
      resolveWait?.()
    })

    while (!finished || queue.length > 0) {
      while (queue.length > 0) {
        yield queue.shift()!
      }
      if (!finished) {
        await new Promise<void>((r) => {
          resolveWait = r
        })
        resolveWait = null
      }
    }

    // 最終 Message を取得して 'done' イベントを生成
    const resp = await stream.finalMessage()
    const text =
      resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim() || null

    const tool_calls: AIToolCall[] = resp.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      }))

    let stop_reason: AIChatResponse['stop_reason'] = 'other'
    if (resp.stop_reason === 'end_turn') stop_reason = 'end_turn'
    else if (resp.stop_reason === 'tool_use') stop_reason = 'tool_use'
    else if (resp.stop_reason === 'max_tokens') stop_reason = 'max_tokens'

    yield {
      type: 'done',
      response: {
        text,
        tool_calls,
        usage: {
          input_tokens: resp.usage.input_tokens,
          output_tokens: resp.usage.output_tokens,
          cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
        },
        stop_reason,
      },
    }
  },
}
