'use server'

import { revalidatePath } from 'next/cache'
import { requireMemberAi } from '@/lib/portal/ai-gate'
import { setMemberAiInstructions } from '@/lib/portal/ai-config'

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
