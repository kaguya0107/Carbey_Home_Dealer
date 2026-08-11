import Link from 'next/link'
import { FileBarChart, TrendingUp, Package, ChevronRight } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { getSalesSummary, getMonthlySales, getYearlySales, getSalesByMember } from '@/lib/portal/sales'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { LineChart } from '@/components/charts/MiniCharts'
import { yen } from '@/lib/portal/labels'

export const dynamic = 'force-dynamic'

const marginOf = (rev: number, profit: number) => (rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0)

/** 本部レポート（全体）：売上・粗利益の月次／年次集計と加盟店別の収益（㉑・レポートメニュー）。 */
export default async function AdminReportsPage() {
  await requireFeature('reports')
  const [summary, monthly, yearly, byMember] = await Promise.all([
    getSalesSummary(),
    getMonthlySales({ months: 12 }),
    getYearlySales({ years: 3 }),
    getSalesByMember(),
  ])
  const hasData = summary.count > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <FileBarChart className="h-5 w-5 text-brand-500" /> レポート（全体）
        </h1>
        <p className="text-sm text-slate-500">全加盟店の売上・粗利益を、月次・年次で集計します。明細・取消は「販売実績管理」から行えます。</p>
      </div>

      {/* 全体サマリ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="販売台数" value={`${summary.count}台`} icon={<Package className="h-4 w-4" />} tone="brand" />
        <StatCard label="売上合計" value={yen(summary.revenueYen)} icon={<TrendingUp className="h-4 w-4" />} tone="blue" />
        <StatCard label="原価合計" value={yen(summary.costYen)} icon={<TrendingUp className="h-4 w-4" />} tone="slate" />
        <StatCard label="粗利益合計" value={yen(summary.profitYen)} icon={<TrendingUp className="h-4 w-4" />} tone="green" />
        <StatCard label="利益率" value={`${summary.marginPct}%`} icon={<TrendingUp className="h-4 w-4" />} tone="green" />
      </div>

      {/* 月別推移グラフ（直近6ヶ月） */}
      <Card>
        <CardHeader title="月別 売上・粗利益の推移" />
        <CardBody>
          {hasData ? (
            <LineChart
              series={[
                { name: '売上', data: monthly.slice(-6).map((m) => m.revenueYen), color: '#1d5cf0' },
                { name: '粗利益', data: monthly.slice(-6).map((m) => m.profitYen), color: '#16a34a' },
              ]}
              labels={monthly.slice(-6).map((m) => m.label)}
              valueFormat={(v) => `${Math.round(v / 10000)}万`}
              unit="円"
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">まだ売却済みの車両がありません。加盟店が車両を売却すると、ここに実績が表示されます。</p>
          )}
        </CardBody>
      </Card>

      {/* 月次・年次の集計表 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="月次集計（全体・直近12ヶ月）" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">月</th>
                    <th className="px-4 py-2.5 text-right font-medium">台数</th>
                    <th className="px-4 py-2.5 text-right font-medium">売上</th>
                    <th className="px-4 py-2.5 text-right font-medium">粗利益</th>
                    <th className="px-4 py-2.5 text-right font-medium">利益率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthly.map((m) => (
                    <tr key={m.ym} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{m.ym}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{m.count}</td>
                      <td className="px-4 py-2 text-right text-slate-700">{yen(m.revenueYen)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${m.profitYen >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{yen(m.profitYen)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{marginOf(m.revenueYen, m.profitYen)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="年次集計（全体・直近3年）" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">年</th>
                    <th className="px-4 py-2.5 text-right font-medium">台数</th>
                    <th className="px-4 py-2.5 text-right font-medium">売上</th>
                    <th className="px-4 py-2.5 text-right font-medium">原価</th>
                    <th className="px-4 py-2.5 text-right font-medium">粗利益</th>
                    <th className="px-4 py-2.5 text-right font-medium">利益率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearly.map((y) => (
                    <tr key={y.year} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{y.label}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{y.count}</td>
                      <td className="px-4 py-2 text-right text-slate-700">{yen(y.revenueYen)}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{yen(y.costYen)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${y.profitYen >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{yen(y.profitYen)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{marginOf(y.revenueYen, y.profitYen)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 加盟店別の収益 */}
      <Card>
        <CardHeader title="加盟店別の収益" action={<Link href="/admin/sales" className="text-xs font-medium text-info-600 hover:underline">販売実績管理へ →</Link>} />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">加盟店</th>
                  <th className="px-5 py-3 font-medium">販売台数</th>
                  <th className="px-5 py-3 font-medium">売上</th>
                  <th className="px-5 py-3 font-medium">粗利益</th>
                  <th className="px-5 py-3 font-medium">利益率</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byMember.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">実績のある加盟店がまだありません。</td></tr>
                )}
                {byMember.map((m) => (
                  <tr key={m.memberId} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">{m.companyName ?? m.memberName}</td>
                    <td className="px-5 py-3 text-slate-600">{m.count}台</td>
                    <td className="px-5 py-3 text-slate-700">{yen(m.revenueYen)}</td>
                    <td className={`px-5 py-3 font-medium ${m.profitYen >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{yen(m.profitYen)}</td>
                    <td className="px-5 py-3 text-slate-600">{m.marginPct}%</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/admin/members/${m.memberId}`} className="inline-flex items-center gap-0.5 text-xs font-medium text-info-600 hover:underline">詳細 <ChevronRight className="h-3 w-3" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
