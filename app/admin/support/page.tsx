import Link from 'next/link'
import { LifeBuoy, Info, Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, MessageSquare } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listAllSupportItems } from '@/lib/portal/support'
import { saveSupportItemAction, deleteSupportItemAction, moveSupportItemAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * 本部サポート（フェーズ⑦-2 CMS 化）。
 * 本部が紹介項目を自分で追加・編集・並べ替え・公開できる。
 * 重要（非弁類似リスク回避）: 「代行」ではなく「紹介・取次」名目で運用する。
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>
}) {
  await requireFeature('members')
  const items = await listAllSupportItems()
  const sp = await searchParams
  const editing = sp.edit ? items.find((s) => s.id === sp.edit) : undefined

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <LifeBuoy className="h-5 w-5 text-brand-500" /> 本部サポート
        </h1>
        <p className="mt-1 text-sm text-slate-500">加盟店の開業をサポートするメニューを管理します。項目はいつでも追加できます。</p>
      </div>

      {/* 法務上の位置づけ（非弁類似リスク回避） */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-amber-800">
          <p className="font-semibold">サポートの位置づけについて（記載時の注意）</p>
          <p className="mt-0.5 text-[13px] leading-relaxed">
            本部は、資格を要する手続き（古物商許可の申請等）を<span className="font-semibold">代行しません</span>。
            有資格の専門業者・行政書士を<span className="font-semibold">紹介・取次</span>する形で支援します。
            案内文には「代行」という表現を使わず、「紹介」「取次」「サポート」でご記載ください。
          </p>
        </div>
      </div>

      {sp.saved && <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> 保存しました。</div>}
      {sp.error === 'required' && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">項目名は必須です。</div>}

      {/* 編集フォーム */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          {editing ? <LifeBuoy className="h-4 w-4 text-brand-500" /> : <Plus className="h-4 w-4 text-brand-500" />}
          {editing ? '項目を編集' : '項目を追加'}
        </h2>
        <form action={saveSupportItemAction} className="space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">項目名 *</label>
            <input name="title" required defaultValue={editing?.title ?? ''} placeholder="例：古物商取得サポート（業者の紹介）" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">案内文（加盟店に表示・「紹介」名目で記載）</label>
            <textarea name="body" rows={6} defaultValue={editing?.body ?? ''} placeholder="有資格の専門業者・行政書士を紹介する旨を記載してください（申請自体は本人または紹介先の有資格者が行う）。" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">本部メモ（加盟店には非表示）</label>
            <input name="note" defaultValue={editing?.note ?? ''} placeholder="社内向けメモ（任意）" className={field} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="published" defaultChecked={editing?.published ?? true} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
            公開する
          </label>
          <div className="flex justify-end gap-2">
            {editing && <a href="/admin/support" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">新規追加に切替</a>}
            <button className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">保存する</button>
          </div>
        </form>
      </div>

      {/* 一覧 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">サポート項目（{items.length}）</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-400">まだ項目がありません。</li>}
            {items.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 px-4 py-3">
                <span className="w-6 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{s.title}</span>
                    {!s.published && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">非公開</span>}
                    {!s.body && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">案内文なし</span>}
                  </div>
                </div>
                {/* 並び替え */}
                <form action={moveSupportItemAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" />
                  <button disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="上へ"><ChevronUp className="h-4 w-4" /></button>
                </form>
                <form action={moveSupportItemAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" />
                  <button disabled={i === items.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="下へ"><ChevronDown className="h-4 w-4" /></button>
                </form>
                <a href={`/admin/support?edit=${s.id}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-info-600 hover:underline">編集</a>
                <form action={deleteSupportItemAction}><input type="hidden" name="id" value={s.id} />
                  <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="削除"><Trash2 className="h-4 w-4" /></button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="flex items-center gap-1.5 text-sm text-slate-600">
          <MessageSquare className="h-4 w-4 text-brand-500" />
          加盟店への案内は<Link href="/admin/chat" className="font-medium text-brand-600 hover:underline">チャット</Link>から行えます。
        </p>
      </div>
    </div>
  )
}
