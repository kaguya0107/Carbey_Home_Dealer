import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, User, ShoppingBag, Handshake } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { getMemberByUserId } from '@/lib/portal/members'
import { getOwnCustomer, listOwnPurchases, listOwnDeals } from '@/lib/portal/crm-member'
import { DEAL_STATUS_LABEL, DEAL_STATUS_ORDER, yen } from '@/lib/portal/labels'
import { updateCustomerAction, addPurchaseAction, createDealAction, updateDealStatusAction } from '../actions'

export const dynamic = 'force-dynamic'

const field = 'w-full rounded-lg border border-carbon-700 bg-carbon-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none'
const small = 'rounded-lg border border-carbon-700 bg-carbon-900 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none'

export default async function PortalCrmCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireMember()
  const member = await getMemberByUserId(session.userId)
  if (!member?.plan?.feature_crm) {
    return <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-10 text-center text-sm text-slate-400">CRM（顧客管理）はご利用プランに含まれていません。</div>
  }
  const { id } = await params
  const customer = await getOwnCustomer(session.userId, id)
  if (!customer) notFound()
  const [purchases, deals] = await Promise.all([listOwnPurchases(session.userId, id), listOwnDeals(session.userId, id)])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/portal/crm" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> 顧客一覧へ
      </Link>

      {/* 基本情報 */}
      <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-5">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-white"><User className="h-4 w-4 text-brand-400" /> 基本情報</h2>
        <form action={updateCustomerAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={customer.id} />
          <div><label className="mb-1 block text-xs text-slate-400">お名前 *</label><input name="name" required defaultValue={customer.name} className={field} /></div>
          <div><label className="mb-1 block text-xs text-slate-400">電話番号</label><input name="phone" defaultValue={customer.phone ?? ''} className={field} /></div>
          <div><label className="mb-1 block text-xs text-slate-400">メール</label><input name="email" type="email" defaultValue={customer.email ?? ''} className={field} /></div>
          <div><label className="mb-1 block text-xs text-slate-400">住所</label><input name="address" defaultValue={customer.address ?? ''} className={field} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs text-slate-400">メモ</label><input name="note" defaultValue={customer.note ?? ''} className={field} /></div>
          <div className="sm:col-span-2"><button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">保存</button></div>
        </form>
      </div>

      {/* 購入履歴 */}
      <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-white"><ShoppingBag className="h-4 w-4 text-brand-400" /> 購入履歴</h2>
        <form action={addPurchaseAction} className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="customer_id" value={customer.id} />
          <input name="vehicle_name" placeholder="車両名" className={small} />
          <input name="price_yen" type="number" min="0" placeholder="価格(円)" className={`${small} w-32`} />
          <input name="purchased_at" type="date" className={small} />
          <button className="rounded-lg bg-carbon-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-carbon-600">追加</button>
        </form>
        <ul className="divide-y divide-carbon-700">
          {purchases.length === 0 && <li className="py-2 text-sm text-slate-500">購入履歴はありません。</li>}
          {purchases.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-200">{p.vehicle_name ?? '（車両名なし）'}</span>
              <span className="flex items-center gap-3 text-slate-400">
                {p.price_yen != null && <span className="text-white">{yen(p.price_yen)}</span>}
                {p.purchased_at && <span className="text-[11px]">{p.purchased_at}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 商談 */}
      <div className="rounded-2xl border border-carbon-700 bg-carbon-900/60 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-white"><Handshake className="h-4 w-4 text-brand-400" /> 商談</h2>
        <form action={createDealAction} className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="customer_id" value={customer.id} />
          <input name="title" placeholder="商談名" className={small} />
          <input name="amount_yen" type="number" min="0" placeholder="金額(円)" className={`${small} w-32`} />
          <button className="rounded-lg bg-carbon-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-carbon-600">商談を追加</button>
        </form>
        <ul className="space-y-2">
          {deals.length === 0 && <li className="text-sm text-slate-500">商談はありません。</li>}
          {deals.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-3">
              <span className="font-medium text-white">{d.title ?? '（商談名なし）'}</span>
              {d.amount_yen != null && <span className="text-sm text-slate-300">{yen(d.amount_yen)}</span>}
              <form action={updateDealStatusAction} className="ml-auto flex items-center gap-1">
                <input type="hidden" name="deal_id" value={d.id} />
                <input type="hidden" name="customer_id" value={customer.id} />
                <select name="status" defaultValue={d.status} className={`${small} py-1`}>
                  {DEAL_STATUS_ORDER.map((s) => <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>)}
                </select>
                <button className="rounded-md border border-carbon-600 px-2 py-1 text-xs text-slate-300 hover:bg-white/5">更新</button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
