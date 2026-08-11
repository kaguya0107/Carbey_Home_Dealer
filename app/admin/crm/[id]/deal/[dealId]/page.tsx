import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listDealNotes } from '@/lib/portal/crm'
import { addDealNoteAction } from '../../../actions'

export const dynamic = 'force-dynamic'

const field = 'flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none'

export default async function DealNotesPage({
  params,
}: {
  params: Promise<{ id: string; dealId: string }>
}) {
  await requireFeature('crm')
  const { id, dealId } = await params
  const notes = await listDealNotes(dealId)

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/admin/crm/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        顧客ページへ
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">商談の対応履歴</h1>

      <form action={addDealNoteAction} className="mb-6 flex gap-2">
        <input type="hidden" name="deal_id" value={dealId} />
        <input type="hidden" name="customer_id" value={id} />
        <input name="body" required placeholder="対応内容を記録..." className={field} />
        <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">追加</button>
      </form>

      <ul className="space-y-3">
        {notes.length === 0 && <li className="text-sm text-slate-400">履歴はありません。</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border-l-2 border-brand-200 bg-white px-4 py-3 text-sm">
            <div className="text-slate-700">{n.body}</div>
            <div className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString('ja-JP')}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
