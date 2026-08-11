import { BarChart3 } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { listMemberAiUsage } from '@/lib/portal/ai-usage-admin'
import { AI_UNIT_COST_YEN } from '@/lib/portal/ai-usage'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export default async function AdminAiUsagePage() {
  await requireStaff()
  const { rows, totalCostYen, ym } = await listMemberAiUsage()

  const totalUsed = rows.reduce((s, r) => s + r.used, 0)
  const totalSearches = rows.reduce((s, r) => s + r.searches, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <BarChart3 className="h-5 w-5 text-brand-500" /> AI利用状況
        </h1>
        <p className="mt-1 text-sm text-slate-500">対象月：{ym}（1検索 = 約{AI_UNIT_COST_YEN}円目安）。feature_ai 有効プランの加盟店を集計しています。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardBody><div className="text-xs text-slate-500">対象加盟店</div><div className="mt-1 text-2xl font-bold text-slate-900">{rows.length}<span className="ml-1 text-sm font-normal text-slate-400">店</span></div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-slate-500">今月の検索数</div><div className="mt-1 text-2xl font-bold text-slate-900">{totalSearches}<span className="ml-1 text-sm font-normal text-slate-400">回</span></div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-slate-500">今月の推定原価</div><div className="mt-1 text-2xl font-bold text-brand-600">{yen(totalCostYen)}</div></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="加盟店別の利用状況" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">加盟店</th>
                  <th className="px-3 py-2 text-right font-medium">割当</th>
                  <th className="px-3 py-2 text-right font-medium">繰越</th>
                  <th className="px-3 py-2 text-right font-medium">使用</th>
                  <th className="px-3 py-2 text-right font-medium">残り</th>
                  <th className="px-3 py-2 text-right font-medium">推定原価</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">AI対象（feature_ai 有効プラン）の加盟店がありません。</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.memberId} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">{r.company ?? r.name}</div>
                      {r.company && <div className="text-xs text-slate-400">{r.name}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.allocated ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.carriedIn}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{r.used}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={r.remaining !== null && r.remaining <= 0 ? 'font-semibold text-rose-600' : 'font-semibold text-brand-600'}>
                        {r.remaining ?? '無制限'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{yen(r.costYen)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 font-medium text-slate-700">
                    <td className="px-3 py-2.5">合計</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums">{totalUsed}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums text-brand-600">{yen(totalCostYen)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
