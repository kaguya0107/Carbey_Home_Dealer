import { NextResponse, type NextRequest } from 'next/server'
import { apiRequireMemberAi } from '@/lib/portal/ai-gate'
import { getEffectiveAiConfig, getRemainingSearches, getMemberAiInstructions } from '@/lib/portal/ai-config'
import { assertQuota, consumeSearch, recordUsage, AiQuotaError } from '@/lib/portal/ai-usage'
import { assertExpansion, recordExpansionUsage, ExpansionDisabledError } from '@/lib/portal/ai-expansions'
import { createConversation, getConversation, listMessages, insertMessage } from '@/lib/portal/ai-conversations'
import { runChat } from '@/lib/ai/orchestrator'
import { buildMemberSystemPrompt } from '@/lib/ai/client'
import { MEMBER_MARKET_TOOLS } from '@/lib/ai/tools'
import { modelForTier } from '@/lib/ai/models'
import { getProvider, DEFAULT_PROVIDER } from '@/lib/ai/providers/registry'
import type { AIChatTurn, AIImage } from '@/lib/ai/providers/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function extractText(content: unknown): string {
  if (content && typeof content === 'object' && 'text' in content) return String((content as { text: unknown }).text ?? '')
  return typeof content === 'string' ? content : ''
}

export async function POST(request: NextRequest) {
  const gate = await apiRequireMemberAi()
  if (!gate.ok) return gate.response
  const { memberId, session } = gate

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
  const mode = body.mode === 'deep' || body.mode === 'docgen' ? body.mode : 'normal'
  const image = body.image && typeof body.image === 'object' ? (body.image as AIImage) : null
  if (!message && !image) return NextResponse.json({ error: 'empty_message' }, { status: 400 })

  // 任意拡張の判定：deep / docgen / image。無ければ normal（検索）。
  const expansion: 'deep' | 'docgen' | 'image' | null =
    mode === 'deep' ? 'deep' : mode === 'docgen' ? 'docgen' : image ? 'image' : null

  const config = await getEffectiveAiConfig(memberId)
  const providerId = DEFAULT_PROVIDER

  // ゲート：拡張は可否トグル、通常は検索残数。
  try {
    if (expansion) await assertExpansion(memberId, expansion)
    else await assertQuota(memberId)
  } catch (e) {
    if (e instanceof ExpansionDisabledError) return NextResponse.json({ error: 'expansion_disabled', kind: e.kind }, { status: 403 })
    if (e instanceof AiQuotaError) return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 })
    throw e
  }

  // 会話（既存は所有者チェック／無ければ新規）
  let convId = conversationId
  if (convId) {
    const conv = await getConversation(convId)
    if (!conv || conv.member_id !== memberId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  } else {
    const conv = await createConversation({ scope: 'member', memberId, createdBy: session.userId, title: (message || '画像解析').slice(0, 40) })
    convId = conv.id
  }

  // ユーザー発言を永続化（画像本体はDBに保存しない）
  await insertMessage({ conversationId: convId, role: 'user', content: { text: message, hasImage: !!image } })

  // 書面生成：現状はゲート＋案内のみ（生成本体は次段階）。従量計上しない。
  if (expansion === 'docgen') {
    const text = '書面生成は有効化されています。ご要望の内容を承りました。（表計算・書面の自動生成機能は順次ご提供予定です。）'
    await insertMessage({ conversationId: convId, role: 'assistant', content: { text }, model: null })
    return NextResponse.json({ conversationId: convId, text, mode: 'docgen', pending: true })
  }

  if (!getProvider(providerId).isConfigured()) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 })
  }

  // モデル：deep は上位、その他は実効グレード。
  const tier = expansion === 'deep' ? 'premium' : config.modelTier
  const model = modelForTier(providerId, tier)

  // 履歴（テキスト）＋今回のユーザー発言（画像があれば添付）
  const prior = await listMessages(convId)
  const history: AIChatTurn[] = prior
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => (m.role === 'user'
      ? ({ role: 'user', content: extractText(m.content) } as AIChatTurn)
      : ({ role: 'assistant', content: extractText(m.content) } as AIChatTurn)))
  history.push(image ? { role: 'user', content: message, images: [image] } : { role: 'user', content: message })

  // 実行（deep は反復多め）／⑫ 加盟者が設定した指示を system prompt へ反映
  const memberInstructions = await getMemberAiInstructions(memberId)
  let result
  try {
    result = await runChat({
      providerId,
      model,
      systemPrompt: buildMemberSystemPrompt(new Date(), memberInstructions),
      tools: MEMBER_MARKET_TOOLS,
      history,
      maxIterations: expansion === 'deep' ? 8 : 6,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isConfig = /api key|apikey|authentication|unauthor|invalid.?api|incorrect api key|401|credit|billing|quota|insufficient/i.test(msg)
    console.error('[portal/ai/chat] runChat failed:', msg)
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

  // メータリング：通常は検索割当を消費、拡張（deep/image）は従量記録（割当は消費しない）。
  let remaining: number | null = null
  if (expansion === 'deep' || expansion === 'image') {
    await recordExpansionUsage({
      memberId,
      scope: 'member',
      kind: expansion,
      modelTier: tier,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      conversationId: convId,
    })
    remaining = (await getRemainingSearches(memberId)).remaining
  } else {
    try {
      remaining = await consumeSearch(memberId)
    } catch (e) {
      if (!(e instanceof AiQuotaError)) throw e
      remaining = 0
    }
    await recordUsage({
      memberId,
      scope: 'member',
      kind: 'search',
      modelTier: tier,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      conversationId: convId,
    })
  }

  return NextResponse.json({ conversationId: convId, text: result.text, evidence: result.evidence, remaining, mode: expansion ?? 'normal' })
}
