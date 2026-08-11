import Link from 'next/link'
import { Contact, Plus, Search, Phone, Mail, ChevronRight } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { getMemberByUserId } from '@/lib/portal/members'
import { listOwnCustomers } from '@/lib/portal/crm-member'
import { createCustomerAction } from './actions'

export const dynamic = 'force-dynamic'

const field = 'w-full rounded-lg border border-carbon-700 bg-carbon-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none'

export default async function PortalCrmPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const session = await requireMember()
  const member = await getMemberByUserId(session.userId)

  if (!member?.plan?.feature_crm) {
    return (
      <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-10 text-center text-sm text-slate-400">
        CRM（顧客管理）は、現在のご利用プランには含まれていません。ご利用をご希望の場合は本部までご連絡ください。
      </div>
    )
  }

  const sp = await searchParams
  const customers = await listOwnCustomers(session.userId, sp.q)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Contact className="h-6 w-6 text-brand-400" />
        <h1 className="text-xl font-bold text-white">CRM（顧客管理）</h1>
        <span className="text-xs text-slate-500">{customers.length} 件</span>
      </div>

      {/* 顧客の追加 */}
      <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-white"><Plus className="h-4 w-4 text-brand-400" /> 顧客を追加</h2>
        <form action={createCustomerAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs text-slate-400">お名前 *</label><input name="name" required placeholder="山田 太郎" className={field} /></div>
          <div><label className="mb-1 block text-xs text-slate-400">電話番号</label><input name="phone" placeholder="090-xxxx-xxxx" className={field} /></div>
          <div><label className="mb-1 block text-xs text-slate-400">メール</label><input name="email" type="email" placeholder="mail@example.com" className={field} /></div>
          <div><label className="mb-1 block text-xs text-slate-400">住所</label><input name="address" className={field} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs text-slate-400">メモ</label><input name="note" placeholder="商談メモ・希望車種など" className={field} /></div>
          <div className="sm:col-span-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"><Plus className="h-4 w-4" /> 顧客を追加</button>
            {sp.error === 'name' && <span className="ml-3 text-xs text-rose-400">お名前を入力してください。</span>}
          </div>
        </form>
      </div>

      {/* 検索 */}
      <form action="/portal/crm" method="get" className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="名前・電話・メールで検索" className={`${field} pl-9`} />
        </div>
        <button className="rounded-lg border border-carbon-600 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">検索</button>
      </form>

      {/* 顧客一覧 */}
      <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-3">
        {customers.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{sp.q ? '該当する顧客がいません。' : 'まだ顧客が登録されていません。上のフォームから追加できます。'}</p>
        ) : (
          <div className="divide-y divide-carbon-700">
            {customers.map((c) => (
              <Link key={c.id} href={`/portal/crm/${c.id}`} className="flex items-center gap-3 px-2 py-3 transition hover:bg-white/5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carbon-800 text-sm font-semibold text-slate-300">{c.name.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-white">{c.name}</span>
                  <span className="flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
