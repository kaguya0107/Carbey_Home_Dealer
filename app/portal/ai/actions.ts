'use server'

import { revalidatePath } from 'next/cache'
import { requireMemberAi } from '@/lib/portal/ai-gate'
import { setMemberAiInstructions } from '@/lib/portal/ai-config'
import {
  listConversations,
  getConversation,
  listMessages,
  deleteConversation,
  setConversationPinned,
  messagesToPanel,
  type PanelMessage,
} from '@/lib/portal/ai-conversations'
import {
  assertDealOwner,
  computeDirectPricing,
  setDirectPricing,
  clearDirectPricing,
  type DpResult,
} from '@/lib/portal/direct-pricing'

/** ⑫ 加盟者が自分のAI相談への指示（プロンプト）を保存する。 */
export async function saveMemberAiInstructionsAction(text: string): Promise<{ ok: boolean; error?: string }> {
  const { member } = await requireMemberAi()
  try {
    await setMemberAiInstructions(member.id, text ?? '')
    revalidatePath('/portal/ai')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '保存に失敗しました' }
  }
}

// ── ⑰⑱ AI検索履歴（残す・消せる・ピン留め・遷移復元） ───────────────────────

export type ConversationListItem = { id: string; title: string | null; updatedAt: string; pinned: boolean }

/** 自分のAI会話一覧（ピン先頭・新しい順）。 */
export async function listAiConversationsAction(): Promise<ConversationListItem[]> {
  const { member } = await requireMemberAi()
  const rows = await listConversations(member.id)
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at, pinned: !!r.pinned_at }))
}

/** 1会話のメッセージを読み込む（所有者チェックつき）。 */
export async function loadAiConversationAction(
  id: string,
): Promise<{ ok: boolean; error?: string; messages?: PanelMessage[] }> {
  const { member } = await requireMemberAi()
  const conv = await getConversation(id)
  if (!conv || conv.member_id !== member.id) return { ok: false, error: 'forbidden' }
  const rows = await listMessages(id)
  return { ok: true, messages: messagesToPanel(rows) }
}

/** 会話を削除（所有者チェックつき）。 */
export async function deleteAiConversationAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { member } = await requireMemberAi()
  const conv = await getConversation(id)
  if (!conv || conv.member_id !== member.id) return { ok: false, error: 'forbidden' }
  await deleteConversation(id)
  return { ok: true }
}

/** 会話のピン留め切替（所有者チェックつき）。 */
export async function pinAiConversationAction(id: string, pinned: boolean): Promise<{ ok: boolean; error?: string }> {
  const { member } = await requireMemberAi()
  const conv = await getConversation(id)
  if (!conv || conv.member_id !== member.id) return { ok: false, error: 'forbidden' }
  await setConversationPinned(id, pinned)
  return { ok: true }
}

// ── ⑳ 簡易ダイレクトプライシング ──────────────────────────────────────────

/** 想定価格でダイレクトプライシングを実行（順位＋競合5件を算出し、設定中にする）。 */
export async function runDirectPricingAction(
  dealId: string,
  targetYen: number,
): Promise<{ ok: boolean; error?: string; result?: DpResult }> {
  const { member } = await requireMemberAi()
  if (!Number.isFinite(targetYen) || targetYen <= 0) return { ok: false, error: '想定価格を正しく入力してください。' }
  try {
    const v = await assertDealOwner(dealId, member.id)
    const result = await computeDirectPricing({ maker: v.maker, carModel: v.car_model, year: v.year }, targetYen)
    await setDirectPricing(dealId, targetYen)
    revalidatePath('/portal/ai')
    revalidatePath('/portal/orders')
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '算出に失敗しました' }
  }
}

/** ダイレクトプライシングを解除。 */
export async function clearDirectPricingAction(dealId: string): Promise<{ ok: boolean; error?: string }> {
  const { member } = await requireMemberAi()
  try {
    await assertDealOwner(dealId, member.id)
    await clearDirectPricing(dealId)
    revalidatePath('/portal/ai')
    revalidatePath('/portal/orders')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '解除に失敗しました' }
  }
}
