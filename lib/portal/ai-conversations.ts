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

/** 会話一覧。memberId 指定で加盟店スコープ、null で本部（scope='hq'）。 */
export async function listConversations(memberId: string | null, limit = 50): Promise<AiConversationRow[]> {
  const supabase = createServiceRoleClient()
  let q = supabase.from('ai_conversations').select('*').order('updated_at', { ascending: false }).limit(limit)
  q = memberId ? q.eq('member_id', memberId) : q.eq('scope', 'hq')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as AiConversationRow[]
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
