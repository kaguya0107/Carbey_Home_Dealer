import { NextResponse, type NextRequest } from 'next/server'
import { apiRequireStaffAi } from '@/lib/portal/ai-gate'
import { getEffectiveAiConfig } from '@/lib/portal/ai-config'
import { recordUsage } from '@/lib/portal/ai-usage'
import { createConversation, getConversation, listMessages, insertMessage } from '@/lib/portal/ai-conversations'
import { runChat } from '@/lib/ai/orchestrator'
import { buildHqSystemPrompt } from '@/lib/ai/client'
import { getAiInstruction, HQ_AI_INSTRUCTIONS_KEY } from '@/lib/portal/editable-notes'
import { MEMBER_MARKET_TOOLS } from '@/lib/ai/tools'
import { modelForTier } from '@/lib/ai/models'
import { getProvider, DEFAULT_PROVIDER } from '@/lib/ai/providers/registry'
import type { AIChatTurn } from '@/lib/ai/providers/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function extractText(content: unknown): string {
  if (content && typeof content === 'object' && 'text' in content) return String((content as { text: unknown }).text ?? '')
  return typeof content === 'string' ? content : ''
}

export async function POST(request: NextRequest) {
  const gate = await apiRequireStaffAi()
  if (!gate.ok) return gate.response
  const { session } = gate

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
  if (!message) return NextResponse.json({ error: 'empty_message' }, { status: 400 })

  // 本部AIは無制限（メータリングは原価記録のみ）。設定は HQ 既定（getEffectiveAiConfig(null)）。
  const config = await getEffectiveAiConfig(null)
  const providerId = DEFAULT_PROVIDER
  const model = modelForTier(providerId, config.modelTier)
  if (!getProvider(providerId).isConfigured()) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 })
  }

  let convId = conversationId
  if (convId) {
    const conv = await getConversation(convId)
    if (!conv || conv.scope !== 'hq') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  } else {
    const conv = await createConversation({ scope: 'hq', memberId: null, createdBy: session.userId, title: message.slice(0, 40) })
    convId = conv.id
  }

  const prior = await listMessages(convId)
  const history: AIChatTurn[] = prior
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => (m.role === 'user'
      ? ({ role: 'user', content: extractText(m.content) } as AIChatTurn)
      : ({ role: 'assistant', content: extractText(m.content) } as AIChatTurn)))
  history.push({ role: 'user', content: message })

  await insertMessage({ conversationId: convId, role: 'user', content: { text: message } })

  const hqInstructions = await getAiInstruction(HQ_AI_INSTRUCTIONS_KEY)

  let result
  try {
    result = await runChat({
      providerId,
      model,
      systemPrompt: buildHqSystemPrompt(new Date(), hqInstructions),
      tools: MEMBER_MARKET_TOOLS,
      history,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isConfig = /api key|apikey|authentication|unauthor|invalid.?api|incorrect api key|401|credit|billing|quota|insufficient/i.test(msg)
    console.error('[admin/ai/chat] runChat failed:', msg)
    return NextResponse.json({ conversationId: convId, error: isConfig ? 'ai_config_error' : 'ai_error', detail: msg }, { status: isConfig ? 503 : 502 })
  }

  await insertMessage({
    conversationId: convId,
    role: 'assistant',
    content: { text: result.text, evidence: result.evidence },
    model: result.model,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  })

  await recordUsage({
    memberId: null,
    scope: 'hq',
    kind: 'search',
    modelTier: config.modelTier,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    conversationId: convId,
  })

  return NextResponse.json({ conversationId: convId, text: result.text, evidence: result.evidence })
}
