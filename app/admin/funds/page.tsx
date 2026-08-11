import Link from 'next/link'
import { Wallet, ChevronRight } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listAllMemberFunds } from '@/lib/portal/ledger'
import { sumMonthlyMgmtFee } from '@/lib/portal/mgmt-fee'
import { yen } from '@/lib/portal/labels'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export const dynamic = 'force-dynamic'

/**
 * 資金管理（全体）— 全加盟店の預かり金残高・加盟金支払状況を一覧集計。
 * 半自動売買フェーズ1。個別管理は各会員詳細画面。
 */
export default async function AdminFundsPage() {
  await requireFeature('members')
  const [funds, totalMgmtFee] = await Promise.all([listAllMemberFunds(), sumMonthlyMgmtFee()])

  const totalBalance = funds.reduce((s, f) => s + f.balanceYen, 0)                  // 仕入れ資金（預かり金）合計
  const totalJoiningFee = funds.reduce((s, f) => s + (f.joiningFeeYen ?? 0), 0)      // 加盟金 合計
  const grandTotal = totalBalance + totalJoiningFee + totalMgmtFee                   // 総合計

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Wallet className="h-5 w-5 text-brand-500" /> 資金管理（全体）
        </h1>
        <p className="text-sm text-slate-500">全加盟店の仕入れ資金（預かり金）と加盟金の支払状況を一覧します。</p>
      </div>

      {/* サマリ（仕入れ資金・加盟金・月額管理手数料・総合計）レビュー⑮ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="text-sm text-slate-500">仕入れ資金（預かり金）</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{yen(totalBalance)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="text-sm text-slate-500">加盟金 合計<span className="ml-1 text-[11px] font-normal text-slate-400">（設定額）</span></div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{yen(totalJoiningFee)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="text-sm text-slate-500">月額管理手数料 合計<span className="ml-1 text-[11px] font-normal text-slate-400">（税抜／月）</span></div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{yen(totalMgmtFee)}</div>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-card">
          <div className="text-sm font-medium text-brand-700">総合計</div>
          <div className="mt-1 text-2xl font-bold text-brand-700">{yen(grandTotal)}</div>
        </div>
      </div>

      {/* #27 集計対象の注記（請求・入金管理との数値差の説明） */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        ※ ここの金額は <span className="font-medium text-slate-700">預かり金残高（台帳）／各会員に設定した加盟金／月額管理手数料の計算値</span> です。
        実際に発行した請求書・入金の実績は「<span className="font-medium text-slate-700">請求・入金管理</span>」でご確認ください。
        <span className="text-slate-400">（集計対象が異なるため、加盟金の設定額と発行済みの請求額は一致しないことがあります。）</span>
      </div>

      {/* 一覧 */}
      <Card>
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">加盟店</th>
                <th className="px-5 py-3 font-medium">預かり金残高</th>
                <th className="px-5 py-3 font-medium">加盟金</th>
                <th className="px-5 py-3 font-medium">加盟金 支払状況</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {funds.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">加盟店がいません。</td></tr>
              )}
              {funds.map((f) => (
                <tr key={f.memberId} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{f.companyName ?? f.memberName}</div>
                    <div className="text-xs text-slate-500">{f.memberName}</div>
                  </td>
                  <td className={`px-5 py-3 font-medium ${f.balanceYen > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{yen(f.balanceYen)}</td>
                  <td className="px-5 py-3 text-slate-600">{yen(f.joiningFeeYen)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={f.paymentStatus === 'paid' ? 'green' : f.paymentStatus === 'overdue' ? 'red' : 'amber'}>
                      {f.paymentStatus === 'paid' ? '支払済み' : f.paymentStatus === 'overdue' ? '延滞' : '未払い'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/members/${f.memberId}`} className="inline-flex items-center gap-1 text-xs font-medium text-info-600 hover:underline">
                      資金管理 <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
