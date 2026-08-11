import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listCustomers } from '@/lib/portal/crm'

export const dynamic = 'force-dynamic'

const field = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none'

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; member?: string }>
}) {
  await requireFeature('crm')
  const sp = await searchParams
  const customers = await listCustomers(sp.q, sp.member || undefined)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">CRM（顧客管理）</h1>
          <p className="mt-1 text-sm text-slate-500">エンドユーザー(購入者) {customers.length} 件</p>
        </div>
        <Link
          href="/admin/crm/new"
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" />
          顧客を追加
        </Link>
      </div>

      <form className="mb-4 flex items-center gap-2" action="/admin/crm" method="get">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="氏名・メール・電話" className={`${field} pl-8`} />
        </div>
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">検索</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">顧客名</th>
              <th className="px-4 py-3 font-medium">担当加盟店</th>
              <th className="px-4 py-3 font-medium">連絡先</th>
              <th className="px-4 py-3 font-medium">住所</th>
              <th className="px-4 py-3 font-medium">登録日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  顧客がいません。
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/crm/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {c.member ? (
                    <Link href={`/admin/members/${c.member.id}`} className="text-brand-600 hover:underline">
                      {c.member.company_name ?? c.member.member_name}
                    </Link>
                  ) : (
                    <span className="text-slate-400">未割当</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.email ?? c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.address ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(c.created_at).toLocaleDateString('ja-JP')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
