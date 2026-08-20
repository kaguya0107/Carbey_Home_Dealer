'use server'

import { revalidatePath } from 'next/cache'
import { requireStaffAi } from '@/lib/portal/ai-gate'
import { setAiInstruction, HQ_AI_INSTRUCTIONS_KEY } from '@/lib/portal/editable-notes'

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
