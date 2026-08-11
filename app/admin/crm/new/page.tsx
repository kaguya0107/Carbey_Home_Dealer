import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listMemberOptions } from '@/lib/portal/crm'
import { createCustomerAction } from '../actions'

export const dynamic = 'force-dynamic'

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none'
const label = 'mb-1 block text-sm font-medium text-slate-700'

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; member?: string }>
}) {
  await requireFeature('crm')
  const [sp, memberOptions] = await Promise.all([searchParams, listMemberOptions()])

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/crm" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        CRM へ
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">顧客を追加</h1>

      {sp.error === 'name_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">顧客名は必須です。</div>
      )}

      <form action={createCustomerAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label className={label}>顧客名 *</label>
          <input name="name" required className={field} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>メール</label>
            <input name="email" type="email" className={field} />
          </div>
          <div>
            <label className={label}>電話</label>
            <input name="phone" className={field} />
          </div>
        </div>
        <div>
          <label className={label}>担当加盟店</label>
          <select name="member_id" defaultValue={sp.member ?? ''} className={field}>
            <option value="">（未割当）</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>住所</label>
          <input name="address" className={field} />
        </div>
        <div>
          <label className={label}>メモ</label>
          <textarea name="note" rows={3} className={field} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Link href="/admin/crm" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            キャンセル
          </Link>
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            追加する
          </button>
        </div>
      </form>
    </div>
  )
}
