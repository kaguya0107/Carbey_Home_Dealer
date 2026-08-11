import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { EvidenceRow, EvidenceKind, EvidenceDocType, EvidenceStatus } from '@/types/database'

const BUCKET = 'member-evidences'

/** 拡張子 → MIME。ブラウザが種別を返さない場合の補完に使う（レビュー⑨）。 */
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', pdf: 'application/pdf',
}

/** 保存に使う MIME を決める。空なら拡張子から補完し、それでも不明なら汎用バイナリ。 */
function resolveContentType(name: string, type: string): string {
  if (type) return type
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

/** 承認待ちエビデンス（本部の承認一覧・レビュー⑪-②）。加盟店名つき・古い順（待たせている順）。 */
export type PendingEvidence = EvidenceRow & {
  member: { id: string; member_name: string; company_name: string | null } | null
}

export async function listPendingEvidences(): Promise<PendingEvidence[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('evidences')
    .select('*, member:members(id, member_name, company_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PendingEvidence[]
}

/** 加盟店の全エビデンス（本部・本人）。 */
export async function listEvidences(memberId: string): Promise<EvidenceRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('evidences')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EvidenceRow[]
}

/** user_id から自分の member を解決してエビデンス一覧を返す（加盟店側）。 */
export async function listOwnEvidences(userId: string): Promise<{ memberId: string; items: EvidenceRow[] } | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!member) return null
  return { memberId: member.id, items: await listEvidences(member.id) }
}

/** エビデンスをアップロードする（加盟店）。 */
export async function uploadEvidence(
  userId: string,
  input: {
    kind: EvidenceKind
    docType: EvidenceDocType | null
    file: { buffer: ArrayBuffer; name: string; type: string; size: number }
  },
): Promise<EvidenceRow> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!member) throw new Error('会員情報が紐付いていません')

  const safeName = input.file.name.replace(/[^\w.\-一-龠ぁ-んァ-ヶ]/g, '_')
  const path = `${member.id}/${input.kind}/${Date.now()}_${safeName}`
  // ブラウザが種別を返さない（iPhone の HEIC など）場合は拡張子から補完する
  const contentType = resolveContentType(input.file.name, input.file.type)
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file.buffer, { contentType, upsert: false })
  if (upErr) throw new Error(`ファイルの保存に失敗しました：${upErr.message}`)

  const { data, error } = await supabase
    .from('evidences')
    .insert({
      member_id: member.id,
      kind: input.kind,
      doc_type: input.docType,
      storage_path: path,
      file_name: input.file.name,
      file_type: contentType,
      file_size: input.file.size,
    } as never)
    .select('*')
    .single<EvidenceRow>()
  if (error) throw new Error(error.message)
  return data
}

/** 自分の pending エビデンスを削除（加盟店・再提出用）。ファイル本体も消す。 */
export async function deleteOwnEvidence(userId: string, evidenceId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase.from('members').select('id').eq('user_id', userId).maybeSingle<{ id: string }>()
  if (!member) throw new Error('会員情報が紐付いていません')

  const { data: ev } = await supabase
    .from('evidences')
    .select('id, storage_path, status')
    .eq('id', evidenceId)
    .eq('member_id', member.id)
    .maybeSingle<{ id: string; storage_path: string; status: EvidenceStatus }>()
  if (!ev) throw new Error('見つかりません')
  // 確認待ち or 却下は削除可（却下→再提出のため）。承認済みは削除不可。
  if (ev.status === 'approved') throw new Error('承認済みのため削除できません')

  await supabase.storage.from(BUCKET).remove([ev.storage_path])
  const { error } = await supabase.from('evidences').delete().eq('id', evidenceId)
  if (error) throw new Error(error.message)
}

/** エビデンスを承認/却下する（本部）。 */
export async function reviewEvidence(
  evidenceId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  note?: string | null,
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('evidences')
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), note: note ?? null } as never)
    .eq('id', evidenceId)
  if (error) throw new Error(error.message)
}

/**
 * エビデンスの実体を、権限確認したうえで取得する（API プロキシ用）。
 * 本部スタッフ or 本人のみ。署名URLは露出しない。
 */
export async function getEvidenceForViewer(
  evidenceId: string,
  viewer: { userId: string; isStaff: boolean },
): Promise<{ data: Blob; name: string; type: string } | null> {
  const supabase = createServiceRoleClient()
  const { data: ev } = await supabase
    .from('evidences')
    .select('member_id, storage_path, file_name, file_type')
    .eq('id', evidenceId)
    .maybeSingle<{ member_id: string; storage_path: string; file_name: string; file_type: string | null }>()
  if (!ev) return null

  if (!viewer.isStaff) {
    const { data: member } = await supabase.from('members').select('id').eq('user_id', viewer.userId).maybeSingle<{ id: string }>()
    if (!member || member.id !== ev.member_id) return null
  }

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(ev.storage_path)
  if (error || !blob) return null
  return { data: blob, name: ev.file_name, type: ev.file_type ?? blob.type ?? 'application/octet-stream' }
}
