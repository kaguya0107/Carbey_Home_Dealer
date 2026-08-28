'use server'

import { revalidatePath } from 'next/cache'
import { requireStaffAi } from '@/lib/portal/ai-gate'
import { setAiInstruction, HQ_AI_INSTRUCTIONS_KEY } from '@/lib/portal/editable-notes'
import {
  listConversations,
  getConversation,
  listMessages,
  deleteConversation,
  setConversationPinned,
  messagesToPanel,
  type PanelMessage,
} from '@/lib/portal/ai-conversations'

/** ⑫ 本部AIへの指示・ナレッジ（プロンプト）を保存する。 */
export async function saveHqAiInstructionsAction(text: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStaffAi()
  try {
    await setAiInstruction(HQ_AI_INSTRUCTIONS_KEY, text ?? '', session.userId)
    revalidatePath('/admin/ai')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '保存に失敗しました' }
  }
}

// ── ⑰⑱ 本部AIの検索履歴（残す・消せる・ピン留め・遷移復元） ─────────────────

export type ConversationListItem = { id: string; title: string | null; updatedAt: string; pinned: boolean }

/** 本部AIの会話一覧（ピン先頭・新しい順）。 */
export async function listHqConversationsAction(): Promise<ConversationListItem[]> {
  await requireStaffAi()
  const rows = await listConversations(null)
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, pinned: !!r.pinned_at }))
}

/** 1会話のメッセージを読み込む（本部スコープ確認つき）。 */
export async function loadHqConversationAction(
  id: string,
): Promise<{ ok: boolean; error?: string; messages?: PanelMessage[] }> {
  await requireStaffAi()
  const conv = await getConversation(id)
  if (!conv || conv.scope !== 'hq') return { ok: false, error: 'forbidden' }
  const rows = await listMessages(id)
  return { ok: true, messages: messagesToPanel(rows) }
}

/** 会話を削除（本部スコープ確認つき）。 */
export async function deleteHqConversationAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireStaffAi()
  const conv = await getConversation(id)
  if (!conv || conv.scope !== 'hq') return { ok: false, error: 'forbidden' }
  await deleteConversation(id)
  return { ok: true }
}

/** 会話のピン留め切替（本部スコープ確認つき）。 */
export async function pinHqConversationAction(id: string, pinned: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireStaffAi()
  const conv = await getConversation(id)
  if (!conv || conv.scope !== 'hq') return { ok: false, error: 'forbidden' }
  await setConversationPinned(id, pinned)
  return { ok: true }
}
