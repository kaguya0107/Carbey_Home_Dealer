import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { AiScope, AiConversationRow, AiMessageRow } from '@/types/database'

/**
 * Phase 4 AI：portal.ai_conversations / ai_messages の薄いリポジトリ。
 * ・加盟店AI（scope='member'）は member_id スコープ。
 * ・本部AI（scope='hq'）は member_id=null。
 * 分析サイトの conversationRepo を portal スキーマ用に置き換えたもの。
 */

export async function createConversation(input: {
  scope: AiScope
  memberId: string | null
  createdBy?: string | null
  title?: string | null
}): Promise<AiConversationRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      scope: input.scope,
      member_id: input.memberId,
      created_by: input.createdBy ?? null,
      title: input.title ?? null,
    } as never)
    .select('*')
    .single<AiConversationRow>()
  if (error) throw new Error(error.message)
  return data
}

/** 会話一覧。memberId 指定で加盟店スコープ、null で本部（scope='hq'）。ピン留めを先頭に、次いで更新日時降順。 */
export async function listConversations(memberId: string | null, limit = 50): Promise<AiConversationRow[]> {
  const supabase = createServiceRoleClient()
  let q = supabase
    .from('ai_conversations')
    .select('*')
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(limit)
  q = memberId ? q.eq('member_id', memberId) : q.eq('scope', 'hq')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as AiConversationRow[]
}

/** 直近（最終更新）の1会話。⑱ ページ遷移後の復元用。 */
export async function getMostRecentConversation(memberId: string | null): Promise<AiConversationRow | null> {
  const supabase = createServiceRoleClient()
  let q = supabase.from('ai_conversations').select('*').order('updated_at', { ascending: false }).limit(1)
  q = memberId ? q.eq('member_id', memberId) : q.eq('scope', 'hq')
  const { data, error } = await q.maybeSingle<AiConversationRow>()
  if (error) throw new Error(error.message)
  return data ?? null
}

/** 会話のピン留め設定（⑰）。所有者チェックは呼び出し側で必須。 */
export async function setConversationPinned(id: string, pinned: boolean): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('ai_conversations')
    .update({ pinned_at: pinned ? new Date().toISOString() : null } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getConversation(id: string): Promise<AiConversationRow | null> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('ai_conversations').select('*').eq('id', id).maybeSingle<AiConversationRow>()
  if (error) throw new Error(error.message)
  return data ?? null
}

/** 会話を削除。ai_messages は FK cascade（migration 060）。所有者チェックは呼び出し側で必須。 */
export async function deleteConversation(id: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('ai_conversations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** パネル表示用のメッセージ形（⑰⑱ 復元・履歴読込に共通利用）。 */
export type PanelEvidence = { function: string; result_count: number; snapshot_date: string; summary?: string }
export type PanelMessage = { role: 'user' | 'assistant'; text: string; evidence?: PanelEvidence[] }

/** ai_messages を画面表示用（user/assistant のテキスト＋evidence）へ変換する。 */
export function messagesToPanel(rows: AiMessageRow[]): PanelMessage[] {
  return rows.flatMap((m) => {
    if (m.role !== 'user' && m.role !== 'assistant') return []
    const c = m.content as { text?: unknown; evidence?: unknown; hasImage?: unknown } | string | null
    const text = typeof c === 'object' && c ? String(c.text ?? '') : String(c ?? '')
    const evidence = typeof c === 'object' && c && Array.isArray(c.evidence) ? (c.evidence as PanelEvidence[]) : undefined
    const hasImage = typeof c === 'object' && c ? !!c.hasImage : false
    return [{ role: m.role, text: hasImage ? `${text || '（画像）'} 🖼画像` : text, evidence }]
  })
}

export async function listMessages(conversationId: string): Promise<AiMessageRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as AiMessageRow[]
}

export async function insertMessage(input: {
  conversationId: string
  role: AiMessageRow['role']
  content: unknown
  model?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
}): Promise<AiMessageRow> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
    } as never)
    .select('*')
    .single<AiMessageRow>()
  if (error) throw new Error(error.message)
  // touch conversation.updated_at
  await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() } as never).eq('id', input.conversationId)
  return data
}
