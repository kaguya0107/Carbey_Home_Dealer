import { BookOpen, CheckCircle2, Trash2, ChevronUp, ChevronDown, Plus, Eye } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { listAllSections } from '@/lib/portal/manual'
import { saveSectionAction, deleteSectionAction, moveSectionAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AdminManualPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string; view?: string }>
}) {
  await requireStaff()
  const items = await listAllSections()
  const sp = await searchParams
  const editing = sp.edit ? items.find((s) => s.id === sp.edit) : undefined
  // #24 可視化：表題クリックで内容・登録状況を確認できる
  const viewing = sp.view ? items.find((s) => s.id === sp.view) : undefined
  const filledCount = items.filter((s) => s.body && s.body.trim()).length

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">実践マニュアルの管理</h1>
        <p className="text-sm text-slate-500">加盟店がチェックする実践マニュアルの項目・内容を編集します。項目はいつでも追加できます。</p>
      </div>

      {sp.saved && <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> 保存しました。</div>}
      {sp.error === 'required' && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">項目名は必須です。</div>}

      {/* #24 項目のプレビュー（表題クリックで内容・登録状況を読み取り専用で表示） */}
      {viewing && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Eye className="h-4 w-4 text-brand-500" /> マニュアル項目のプレビュー
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-medium ${viewing.flow === 'auto' ? 'bg-brand-50 text-brand-700' : viewing.flow === 'both' ? 'bg-slate-100 text-slate-600' : 'bg-info-50 text-info-700'}`}>{viewing.flow === 'auto' ? '自動' : viewing.flow === 'both' ? '共通' : '半自動'}</span>
              {viewing.published ? <span className="rounded bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">公開中</span> : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">非公開</span>}
              {viewing.body && viewing.body.trim() ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">記入済み</span> : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600">内容未記入</span>}
              <a href="/admin/manual" className="text-info-600 hover:underline">閉じる</a>
            </div>
          </div>
          <h3 className="mb-2 text-base font-bold text-slate-900">{viewing.title}</h3>
          {viewing.body && viewing.body.trim() ? (
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{viewing.body}</div>
          ) : (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">内容が未記入です。「編集」から本文を登録してください。</div>
          )}
          {(viewing.video_url || viewing.attachment_name || viewing.note) && (
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              {viewing.video_url && <div>動画URL：<a href={viewing.video_url} target="_blank" rel="noreferrer" className="text-info-600 hover:underline">{viewing.video_url}</a></div>}
              {viewing.attachment_name && <div>添付ファイル：{viewing.attachment_name}</div>}
              {viewing.note && <div>本部メモ：{viewing.note}</div>}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <a href={`/admin/manual?edit=${viewing.id}`} className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">この項目を編集</a>
          </div>
        </div>
      )}

      {/* 編集フォーム */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          {editing ? <BookOpen className="h-4 w-4 text-brand-500" /> : <Plus className="h-4 w-4 text-brand-500" />}
          {editing ? '項目を編集' : '項目を追加'}
        </h2>
        <form action={saveSectionAction} className="space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">項目名 *</label>
            <input name="title" required defaultValue={editing?.title ?? ''} placeholder="例：相場の見方" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">内容（加盟店に表示・後から編集可）</label>
            <textarea name="body" rows={8} defaultValue={editing?.body ?? ''} placeholder="ローンチ後に内容を記載してください（動画URL・説明など）" className={`${field} font-mono`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">本部メモ（加盟店には非表示）</label>
            <input name="note" defaultValue={editing?.note ?? ''} placeholder="社内向けメモ（任意）" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">フロー種別</label>
            <select name="flow" defaultValue={editing?.flow ?? 'semi'} className={field}>
              <option value="semi">半自動売買（semi）</option>
              <option value="auto">自動売買（auto）</option>
              <option value="both">共通（both・両フローに表示）</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-400">加盟店には、そのプラン/フローに該当する項目だけが表示されます。</p>
          </div>
          {/* ㉜ 動画URL（YouTube/Vimeo等の埋め込み再生） */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">動画URL（任意・YouTube / Vimeo）</label>
            <input name="video_url" defaultValue={editing?.video_url ?? ''} placeholder="https://www.youtube.com/watch?v=..." className={field} />
          </div>
          {/* ㉜ 添付ファイル（PDF等のマニュアルデータ） */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">添付ファイル（任意・PDF等、20MBまで）</label>
            <input type="file" name="attachment" accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
            {editing?.attachment_name && (
              <p className="mt-1 text-[11px] text-slate-500">現在の添付：{editing.attachment_name}（新しいファイルを選ぶと差し替わります）</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="published" defaultChecked={editing?.published ?? true} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
            公開する（加盟店のチェック対象になります）
          </label>
          <div className="flex justify-end gap-2">
            {editing && <a href="/admin/manual" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">新規追加に切替</a>}
            <button className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">保存する</button>
          </div>
        </form>
      </div>

      {/* 一覧 */}
      <div>
        <h2 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-900">
          マニュアル項目（{items.length}）
          <span className="text-xs font-normal text-slate-500">記入済み {filledCount} ／ 未記入 {items.length - filledCount}</span>
          <span className="text-xs font-normal text-slate-400">※項目名をクリックすると内容を確認できます</span>
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-400">まだ項目がありません。</li>}
            {items.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 px-4 py-3">
                <span className="w-6 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a href={`/admin/manual?view=${s.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-600 hover:underline">{s.title}</a>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      s.flow === 'auto' ? 'bg-brand-50 text-brand-700' : s.flow === 'both' ? 'bg-slate-100 text-slate-600' : 'bg-info-50 text-info-700'
                    }`}>
                      {s.flow === 'auto' ? '自動' : s.flow === 'both' ? '共通' : '半自動'}
                    </span>
                    {!s.published && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">非公開</span>}
                    {!s.body && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">内容未記入</span>}
                  </div>
                </div>
                {/* 並び替え */}
                <form action={moveSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" />
                  <button disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="上へ"><ChevronUp className="h-4 w-4" /></button>
                </form>
                <form action={moveSectionAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" />
                  <button disabled={i === items.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="下へ"><ChevronDown className="h-4 w-4" /></button>
                </form>
                <a href={`/admin/manual?edit=${s.id}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-info-600 hover:underline">編集</a>
                <form action={deleteSectionAction}><input type="hidden" name="id" value={s.id} />
                  <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="削除"><Trash2 className="h-4 w-4" /></button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
