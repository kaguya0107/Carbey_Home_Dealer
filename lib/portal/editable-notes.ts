// 本部が自由編集できる注意書き（掲示文）— portal.editable_notes（migration 062）。
//
// key で掲示箇所を識別する。既知の掲示箇所は NOTE_REGISTRY に定義（本部の編集画面はこれを列挙）。
// 閲覧は加盟店にも表示するため server 側（service role）で読み取り、そのまま描画する。

import { createServiceRoleClient } from '@/lib/supabase/admin'

export type EditableNote = {
  key: string
  title: string | null
  body: string
  updatedAt: string | null
}

// 読み取り列（updated_by は使わない）。supabase-js の型推論回避のため明示型を渡す。
type NoteReadRow = { key: string; title: string | null; body: string; updated_at: string }

/** 本部が編集できる掲示文の一覧（キー・表示先の説明）。ここに足せば編集画面に自動で並ぶ。 */
export const NOTE_REGISTRY: ReadonlyArray<{ key: string; label: string; where: string }> = [
  {
    key: 'member_ai_notice',
    label: '加盟店 AI相談ページの注意書き',
    where: '加盟店の「AI相談・相場分析」ページ上部に表示されます。',
  },
]

/** 1件取得（未登録なら null）。 */
export async function getNote(key: string): Promise<EditableNote | null> {
  const client = createServiceRoleClient()
  const { data } = await client
    .from('editable_notes')
    .select('key, title, body, updated_at')
    .eq('key', key)
    .maybeSingle<NoteReadRow>()
  if (!data) return null
  return { key: data.key, title: data.title, body: data.body, updatedAt: data.updated_at }
}

/** レジストリの全掲示文を取得（未登録キーは空の枠として返す）。 */
export async function listRegistryNotes(): Promise<Array<EditableNote & { label: string; where: string }>> {
  const client = createServiceRoleClient()
  const { data } = await client.from('editable_notes').select('key, title, body, updated_at').returns<NoteReadRow[]>()
  const byKey = new Map((data ?? []).map((r) => [r.key, r]))
  return NOTE_REGISTRY.map((def) => {
    const row = byKey.get(def.key)
    return {
      key: def.key,
      label: def.label,
      where: def.where,
      title: row?.title ?? null,
      body: row?.body ?? '',
      updatedAt: row?.updated_at ?? null,
    }
  })
}

// ---------------------------------------------------------------------
// ⑫ AIプロンプト入力（本部AI用のナレッジ／指示）
//   editable_notes を流用するが、加盟店に「表示」する注意書きではなく本部AIの system prompt に
//   注入する内部設定のため、NOTE_REGISTRY には載せず専用キーで読み書きする。
// ---------------------------------------------------------------------
export const HQ_AI_INSTRUCTIONS_KEY = 'hq_ai_instructions'
const AI_INSTRUCTION_KEYS: ReadonlyArray<string> = [HQ_AI_INSTRUCTIONS_KEY]

/** AI指示（プロンプト）を取得。未設定なら空文字。 */
export async function getAiInstruction(key: string): Promise<string> {
  const note = await getNote(key)
  return note?.body ?? ''
}

/** AI指示（プロンプト）を保存（本部）。専用キーのみ許可。 */
export async function setAiInstruction(key: string, body: string, updatedBy?: string | null): Promise<void> {
  if (!AI_INSTRUCTION_KEYS.includes(key)) throw new Error('未知のAI指示キーです。')
  const client = createServiceRoleClient()
  const { error } = await client.from('editable_notes').upsert(
    { key, title: null, body: body ?? '', updated_at: new Date().toISOString(), updated_by: updatedBy ?? null } as never,
    { onConflict: 'key' },
  )
  if (error) throw new Error(`AI指示の保存に失敗しました: ${error.message}`)
}

/** 本部による更新（upsert）。key はレジストリに含まれるもののみ許可。 */
export async function upsertNote(
  key: string,
  input: { title: string | null; body: string },
  updatedBy?: string | null,
): Promise<void> {
  if (!NOTE_REGISTRY.some((n) => n.key === key)) throw new Error('未知の掲示キーです。')
  const client = createServiceRoleClient()
  const { error } = await client.from('editable_notes').upsert(
    {
      key,
      title: input.title?.trim() || null,
      body: input.body ?? '',
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    } as never,
    { onConflict: 'key' },
  )
  if (error) throw new Error(`注意書きの保存に失敗しました: ${error.message}`)
}
