import Link from 'next/link'
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react'
import type { AntiqueGrace } from '@/lib/portal/trading'

/**
 * 古物商猶予の警告バナー（フェーズ⑥-1）。
 *   warning（残30日以内）: 黄色の事前警告
 *   expired（超過）      : 赤の制限中警告（取引ロック）
 *   ok / approved        : 何も表示しない
 */
export default function AntiqueGraceBanner({ grace }: { grace: AntiqueGrace | null }) {
  if (!grace) return null

  if (grace.state === 'warning') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-amber-300">古物商許可証の提出期限が近づいています</p>
          <p className="mt-0.5 text-amber-200/80">
            提出期限まであと <span className="font-bold">{grace.daysLeft}日</span>
            {grace.dueDate && <>（{grace.dueDate} まで）</>}。
            期限を過ぎると仕入れオーダー・取引機能が停止します。お早めにアップロードしてください。
          </p>
        </div>
        <Link href="/portal/onboarding/evidence" className="flex shrink-0 items-center gap-1 self-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20">
          アップロード <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  if (grace.state === 'expired') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-rose-300">【期日が超過したので許可証をアップロードお願いします】</p>
          <p className="mt-0.5 text-rose-200/80">
            古物商許可証の提出期限（{grace.dueDate}）を <span className="font-bold">{Math.abs(grace.daysLeft ?? 0)}日</span> 超過しています。
            現在、<span className="font-semibold">仕入れオーダー・取引機能は停止中</span>です。
            許可証をアップロードいただくと取引を再開できます（本人情報・資金管理・AI分析はご利用いただけます）。
          </p>
        </div>
        <Link href="/portal/onboarding/evidence" className="flex shrink-0 items-center gap-1 self-center rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">
          アップロード <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  return null
}
