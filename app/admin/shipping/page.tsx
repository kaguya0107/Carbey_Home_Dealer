import { Truck, Plus, Trash2, Car } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listShippingRates, listSpecialMakers, getShippingFromPref, getShippingDefaultToPref } from '@/lib/portal/shipping'
import { PREFECTURES } from '@/lib/portal/prefectures'
import { yen } from '@/lib/portal/labels'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { setRateAction, deleteRateAction, addMakerAction, deleteMakerAction, setFromPrefAction, setDefaultToPrefAction } from './actions'

export const dynamic = 'force-dynamic'

const field = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none'

export default async function AdminShippingPage() {
  await requireFeature('members')
  const [rates, makers, fromPref, defaultToPref] = await Promise.all([listShippingRates(), listSpecialMakers(), getShippingFromPref(), getShippingDefaultToPref()])
  // 料金が設定済みなのに発地と一致しない＝自動計算が効かない状態を検知（#50 根因）
  const rateOrigins = Array.from(new Set(rates.map((r) => r.from_pref)))
  const originMismatch = rates.length > 0 && !rateOrigins.includes(fromPref)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Truck className="h-5 w-5 text-brand-500" /> 陸送費設定
        </h1>
        <p className="mt-1 text-sm text-slate-500">発地×着地の陸送費を設定します。設定した区間は自動計算、未設定・特殊車は個別見積もりに切り替わります。</p>
      </div>

      {/* #50 発地（拠点）の設定 — 料金マスタの発地と揃えないと自動計算が効かない */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Truck className="h-4 w-4 text-brand-500" /> 陸送の発地（拠点）</span>} />
        <CardBody>
          <p className="mb-2 text-xs text-slate-500">陸送費の自動計算は、この発地からの料金設定を使います。<span className="font-medium text-slate-600">料金を登録した発地と必ず一致させてください。</span></p>
          <form action={setFromPrefAction} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">発地（拠点の都道府県）</label>
              <select name="from_pref" defaultValue={fromPref} className={field}>
                {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">発地を設定</button>
            <span className="pb-1 text-xs text-slate-500">現在の発地：<span className="font-medium text-slate-700">{fromPref}</span></span>
          </form>
          {originMismatch && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ 料金は「{rateOrigins.join('・')}」発で登録されていますが、現在の発地は「<span className="font-semibold">{fromPref}</span>」です。<span className="font-medium">このままでは自動計算が効きません（すべて個別見積扱い）。</span>発地を「{rateOrigins[0]}」に合わせてください。
            </div>
          )}

          {/* #52改 陸送先の初期値：まず各加盟店の拠点(delivery_pref)、無ければ下のフォールバック */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs text-slate-500">
              新規案件の<span className="font-medium text-slate-600">陸送先（着地）の初期値</span>は、まず<span className="font-medium text-slate-600">各加盟店の拠点（会員詳細・加盟店プロフィールの「陸送先の都道府県」）</span>が使われます。
              下は、<span className="font-medium text-slate-600">加盟店に拠点が未設定のときのフォールバック</span>です（通常は「なし」で構いません）。
            </p>
            <form action={setDefaultToPrefAction} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">フォールバックの陸送先（任意）</label>
                <select name="to_pref" defaultValue={defaultToPref ?? ''} className={field}>
                  <option value="">（なし・加盟店ごとに選択）</option>
                  {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">保存</button>
              <span className="pb-1 text-xs text-slate-500">現在：<span className="font-medium text-slate-700">{defaultToPref ?? 'なし'}</span></span>
            </form>
          </div>
        </CardBody>
      </Card>

      {/* 料金の追加・変更 */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Plus className="h-4 w-4 text-brand-500" /> 料金を設定・変更（発地 → 着地）</span>} />
        <CardBody>
          <p className="mb-2 text-xs text-slate-400">同じ発地×着地を設定すると、既存の料金が上書き（更新）されます。既存分は下の一覧からも直接変更できます。</p>
          <form action={setRateAction} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">発地</label>
              <select name="from_pref" className={field} defaultValue="">
                <option value="" disabled>選択</option>
                {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <span className="pb-2 text-slate-400">→</span>
            <div>
              <label className="mb-1 block text-xs text-slate-500">着地</label>
              <select name="to_pref" className={field} defaultValue="">
                <option value="" disabled>選択</option>
                {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">料金（円）</label>
              <input name="amount" inputMode="numeric" placeholder="50000" className={`${field} w-32`} />
            </div>
            <button className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">設定</button>
          </form>
          <p className="mt-2 text-[11px] text-slate-400">同じ区間を再設定すると上書きされます。</p>
        </CardBody>
      </Card>

      {/* 料金一覧 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">設定済みの料金（{rates.length} 区間）<span className="ml-2 text-xs font-normal text-slate-400">※金額を入力して「更新」でその場で変更できます</span></h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">発地</th>
                <th className="px-4 py-2.5 font-medium">着地</th>
                <th className="px-4 py-2.5 font-medium">料金</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rates.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">未設定です。区間ごとに料金を追加してください。</td></tr>}
              {rates.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-700">{r.from_pref}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.to_pref}</td>
                  {/* #38 料金はその場で変更（更新）できる */}
                  <td className="px-4 py-2.5">
                    <form action={setRateAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="from_pref" value={r.from_pref} />
                      <input type="hidden" name="to_pref" value={r.to_pref} />
                      <input name="amount" inputMode="numeric" defaultValue={r.amount_yen} className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-brand-400 focus:outline-none" />
                      <span className="text-xs text-slate-400">円</span>
                      <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">更新</button>
                    </form>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteRateAction} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="削除"><Trash2 className="h-4 w-4" /></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 特殊車メーカー（個別見積） */}
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Car className="h-4 w-4 text-brand-500" /> 個別見積もり対象メーカー（高級車・規格外車）</span>} />
        <CardBody>
          <p className="mb-3 text-xs text-slate-500">これらのメーカーは陸送費が高額になるため、自動計算せず「個別見積もり」に切り替わります。</p>
          <form action={addMakerAction} className="mb-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-500">メーカー名</label>
              <input name="maker" placeholder="例：マセラティ" className={`${field} w-full`} />
            </div>
            <button className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">追加</button>
          </form>
          <div className="flex flex-wrap gap-2">
            {makers.length === 0 && <span className="text-xs text-slate-400">未登録です。</span>}
            {makers.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {m.maker}
                <form action={deleteMakerAction} className="inline">
                  <input type="hidden" name="id" value={m.id} />
                  <button className="text-slate-400 hover:text-red-600" title="削除"><Trash2 className="h-3 w-3" /></button>
                </form>
              </span>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
