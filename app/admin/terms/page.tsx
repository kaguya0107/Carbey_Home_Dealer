import { FileText, CheckCircle2, Trash2, Plus, Receipt, Eye } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { listAgreements, listAttachments } from '@/lib/portal/agreements'
import { saveAgreementAction, deleteAgreementAction, saveAttachmentAction, deleteAttachmentAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string; edit_attach?: string; view?: string }>
}) {
  await requireStaff()
  const items = await listAgreements()
  const sp = await searchParams
  const editing = sp.edit ? items.find((a) => a.id === sp.edit) : undefined
  const active = items.find((a) => a.published)
  const attachments = active ? await listAttachments(active.id) : []
  const editingAttach = sp.edit_attach ? attachments.find((a) => a.id === sp.edit_attach) : undefined
  // #23 可視化：本部が最新版（または任意の版）の本文・料金表を読み取り専用で確認できる
  const previewTarget = (sp.view ? items.find((a) => a.id === sp.view) : undefined) ?? active
  const previewAttachments = previewTarget ? (previewTarget.id === active?.id ? attachments : await listAttachments(previewTarget.id)) : []

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">利用規約の設定</h1>
        <p className="text-sm text-slate-500">加盟店が同意する利用規約を編集・公開します。公開できるのは1つです。</p>
      </div>

      {sp.saved && <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> 保存しました。</div>}
      {sp.error === 'required' && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">タイトルと本文は必須です。</div>}

      {/* #23 現在公開中（＝加盟店に表示中）の利用規約を読み取り専用で可視化 */}
      {previewTarget ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Eye className="h-4 w-4 text-brand-500" />
              {previewTarget.id === active?.id ? '現在公開中の利用規約（最新版・加盟店に表示中）' : '利用規約プレビュー（過去バージョン）'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>v{previewTarget.version}</span>
              {previewTarget.published
                ? <span className="rounded bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">公開中</span>
                : <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">下書き</span>}
              <span>{new Date(previewTarget.updated_at).toLocaleString('ja-JP')} 更新</span>
              {previewTarget.id !== active?.id && active && <a href="/admin/terms" className="text-info-600 hover:underline">最新版に戻す</a>}
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <h3 className="mb-2 text-base font-bold text-slate-900">{previewTarget.title}</h3>
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{previewTarget.body}</div>
          </div>
          {previewAttachments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Receipt className="h-3.5 w-3.5 text-brand-500" /> 別添（料金表・規定など）</h3>
              <div className="space-y-3">
                {previewAttachments.map((att) => (
                  <div key={att.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-1 text-sm font-semibold text-slate-800">{att.title}</div>
                    {att.body
                      ? <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-slate-600">{att.body}</div>
                      : <div className="text-xs text-amber-600">内容が未入力です。</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">これは加盟店に表示されている内容です。変更は下の編集フォーム／料金表から行えます（公開済みの編集は新バージョンとして発行されます）。</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">現在、公開中の利用規約はありません。下のフォームで作成・公開してください。</div>
      )}

      {/* 編集フォーム */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FileText className="h-4 w-4 text-brand-500" /> {editing ? '規約を編集' : '新しい規約を作成'}
        </h2>
        <form action={saveAgreementAction} className="space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">タイトル *</label>
            <input name="title" required defaultValue={editing?.title ?? 'カーベイホームディーラー 加盟店利用規約'} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">本文 *</label>
            <textarea name="body" required rows={14} defaultValue={editing?.body ?? ''} placeholder="利用規約の本文を入力（改行はそのまま反映されます）" className={`${field} font-mono`} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="published" defaultChecked={editing?.published ?? true} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
            この規約を公開する（加盟店に表示・同意対象になります）
          </label>
          <div className="flex justify-end gap-2">
            {editing && <a href="/admin/terms" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">新規に切替</a>}
            <button className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">保存する</button>
          </div>
        </form>
      </div>

      {/* 一覧 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">規約の履歴</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-400">まだ規約がありません。</li>}
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{a.title}</span>
                    <span className="text-xs text-slate-400">v{a.version}</span>
                    {a.published && <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">公開中</span>}
                  </div>
                  <div className="text-xs text-slate-400">{new Date(a.updated_at).toLocaleString('ja-JP')}</div>
                </div>
                <a href={`/admin/terms?view=${a.id}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:underline">表示</a>
                <a href={`/admin/terms?edit=${a.id}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-info-600 hover:underline">編集</a>
                {!a.published && (
                  <form action={deleteAgreementAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="削除"><Trash2 className="h-4 w-4" /></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
        {!active && <p className="mt-2 text-xs text-amber-600">⚠️ 公開中の規約がありません。加盟店が同意できるよう、いずれかを公開してください。</p>}
      </div>

      {/* ===== 各種料金表（別添・規約と同居して同意対象） ===== */}
      {active && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Receipt className="h-4 w-4 text-brand-500" /> 別添（各種料金表・規定など）
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            「{active.title}」に付随する別添です（例：加修料金表、クレーム規定 など）。加盟店の規約ページに同居表示され、規約と一緒に同意対象になります。<span className="font-medium text-slate-600">項目は何個でも追加できます</span>。
          </p>

          {/* 追加/編集フォーム */}
          <form action={saveAttachmentAction} className="mb-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <input type="hidden" name="agreement_id" value={active.id} />
            {editingAttach && <input type="hidden" name="id" value={editingAttach.id} />}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              {editingAttach ? <FileText className="h-3.5 w-3.5 text-brand-500" /> : <Plus className="h-3.5 w-3.5 text-brand-500" />}
              {editingAttach ? '別添を編集' : '別添を追加'}
            </div>
            <input name="title" required defaultValue={editingAttach?.title ?? ''} placeholder="別添のタイトル（例：加修料金表 / クレーム規定）" className={field} />
            <textarea name="body" rows={8} defaultValue={editingAttach?.body ?? ''} placeholder="内容をテキストで入力（改行はそのまま反映されます）" className={`${field} font-mono`} />
            <div className="flex justify-end gap-2">
              {editingAttach && <a href="/admin/terms" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">新規に切替</a>}
              <button className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">保存</button>
            </div>
          </form>

          {/* 料金表一覧 */}
          <ul className="divide-y divide-slate-100">
            {attachments.length === 0 && <li className="py-3 text-center text-xs text-slate-400">別添はまだありません。</li>}
            {attachments.map((att) => (
              <li key={att.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{att.title}</span>
                {!att.body && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">内容未入力</span>}
                <a href={`/admin/terms?edit_attach=${att.id}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-info-600 hover:underline">編集</a>
                <form action={deleteAttachmentAction}>
                  <input type="hidden" name="id" value={att.id} />
                  <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="削除"><Trash2 className="h-4 w-4" /></button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            ※ 別添（料金表・規定など）を変更した場合、既存加盟店にも再同意を求めるには、規約を編集・再公開して新バージョンを発行してください。
          </p>
        </div>
      )}
    </div>
  )
}
