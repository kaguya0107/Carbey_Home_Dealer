import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { getCustomer, listPurchases, listDeals, listMemberOptions } from '@/lib/portal/crm'
import { DEAL_STATUS_LABEL, DEAL_STATUS_STYLE, DEAL_STATUS_ORDER, yen } from '@/lib/portal/labels'
import type { DealStatus } from '@/types/database'
import {
  updateCustomerAction,
  addPurchaseAction,
  createDealAction,
  updateDealStatusAction,
} from '../actions'

export const dynamic = 'force-dynamic'

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none'
const small = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature('crm')
  const { id } = await params
  const [customer, purchases, deals, memberOptions] = await Promise.all([
    getCustomer(id),
    listPurchases(id),
    listDeals(id),
    listMemberOptions(),
  ])
  if (!customer) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/crm" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        CRM へ
      </Link>

      <h1 className="mb-6 text-xl font-bold text-slate-900">{customer.name}</h1>

      {/* 顧客情報 (編集) */}
      <form action={updateCustomerAction} className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <input type="hidden" name="id" value={customer.id} />
        <h2 className="mb-4 text-sm font-semibold text-slate-900">基本情報</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">顧客名</label>
            <input name="name" defaultValue={customer.name} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">メール</label>
            <input name="email" defaultValue={customer.email ?? ''} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">電話</label>
            <input name="phone" defaultValue={customer.phone ?? ''} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">住所</label>
            <input name="address" defaultValue={customer.address ?? ''} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">担当加盟店</label>
            <select name="member_id" defaultValue={customer.member_id ?? ''} className={field}>
              <option value="">（未割当）</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">メモ</label>
            <textarea name="note" rows={2} defaultValue={customer.note ?? ''} className={field} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">保存</button>
        </div>
      </form>

      {/* 購入履歴 (要求書 5.12) */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">購入履歴</h2>
        <form action={addPurchaseAction} className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="customer_id" value={customer.id} />
          <input name="vehicle_name" required placeholder="車両名" className={small} />
          <input name="price_yen" type="number" min="0" placeholder="価格(円)" className={`${small} w-32`} />
          <input name="purchased_at" type="date" className={small} />
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">追加</button>
        </form>
        <ul className="divide-y divide-slate-100">
          {purchases.length === 0 && <li className="py-2 text-sm text-slate-400">購入履歴はありません。</li>}
          {purchases.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-900">{p.vehicle_name}</span>
              <span className="flex gap-4 text-slate-500">
                <span>{yen(p.price_yen)}</span>
                <span>{p.purchased_at ?? '—'}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 商談管理 (要求書 5.12) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">商談</h2>
        <form action={createDealAction} className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="customer_id" value={customer.id} />
          <input name="title" placeholder="商談名" className={small} />
          <input name="amount_yen" type="number" min="0" placeholder="金額(円)" className={`${small} w-32`} />
          <select name="status" defaultValue="lead" className={small}>
            {DEAL_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">商談を追加</button>
        </form>
        <ul className="space-y-3">
          {deals.length === 0 && <li className="text-sm text-slate-400">商談はありません。</li>}
          {deals.map((d) => (
            <li key={d.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{d.title ?? '(無題)'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DEAL_STATUS_STYLE[d.status as DealStatus]}`}>
                    {DEAL_STATUS_LABEL[d.status as DealStatus]}
                  </span>
                  {d.amount_yen != null && <span className="text-sm text-slate-500">{yen(d.amount_yen)}</span>}
                </div>
                <form action={updateDealStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="deal_id" value={d.id} />
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <select name="status" defaultValue={d.status} className="rounded border border-slate-200 px-2 py-1 text-xs">
                    {DEAL_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <button className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">更新</button>
                </form>
              </div>
              <Link href={`/admin/crm/${customer.id}/deal/${d.id}`} className="mt-1 inline-block text-xs text-brand-600 hover:underline">
                対応履歴を見る →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
