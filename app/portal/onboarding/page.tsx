import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Lock, Unlock, Rocket, GraduationCap, FileText, ShieldCheck, BookOpen, ScrollText, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/auth/session'
import { getOwnOnboarding } from '@/lib/portal/onboarding'
import { getOwnAntiqueGrace } from '@/lib/portal/trading'
import { getOwnFlow } from '@/lib/portal/flow'
import { DarkCard, DarkCardHeader, DarkCardBody } from '@/components/portal-dark/DarkUI'
import { DarkProgressRing } from '@/components/portal-dark/DarkCharts'
import OnboardingFlow from '@/components/portal-dark/OnboardingFlow'
import AntiqueGraceBanner from '@/components/portal-dark/AntiqueGraceBanner'
import FlowSwitcher from '@/components/portal-dark/FlowSwitcher'

export const dynamic = 'force-dynamic'

/**
 * フローチャート型・ゲート式オンボーディング（加盟店）。
 * 前ステップ完了まで次はロック（飛ばせない）。全完了で機能が解放される。
 */
export default async function OnboardingPage() {
  const session = await requireMember()
  const [view, grace, flowInfo] = await Promise.all([
    getOwnOnboarding(session.userId),
    getOwnAntiqueGrace(session.userId),
    getOwnFlow(session.userId),
  ])

  if (!view) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        会員情報が紐付いていません。本部にお問い合わせください。
      </div>
    )
  }

  const doneSteps = view.steps.filter((s) => s.status === 'done').length
  const currentStep = view.steps.find((s) => s.status === 'current')

  return (
    <div className="space-y-5">
      {/* 古物商猶予の警告（黄=事前 / 赤=超過ロック）を進捗ステータス上部に表示 */}
      <AntiqueGraceBanner grace={grace} />
      {/* ヒーロー */}
      <div className="relative overflow-hidden rounded-2xl border border-carbon-700 bg-carbon-900 text-white">
        <Image src="/login-hero.png" alt="" fill priority sizes="100vw" className="object-cover object-right opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon-950 via-carbon-950/85 to-transparent" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">Onboarding Flow</p>
            <h1 className="mt-1.5 text-2xl font-bold text-white">スタートアップ フロー</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              各ステップを<span className="font-semibold text-white">順番に</span>完了してください。
              前のステップが終わるまで次には進めません。すべて完了すると、仕入れ・販売などの全機能が解放されます。
            </p>
            {currentStep && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm backdrop-blur">
                <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
                現在のステップ：<span className="font-semibold">{currentStep.label}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-5 rounded-xl bg-white/5 p-5 backdrop-blur">
            <DarkProgressRing pct={view.pct} size={84} />
            <div className="text-sm">
              <div className="font-semibold">全体進捗</div>
              <div className="mt-1 text-slate-300">{doneSteps} / {view.steps.length} ステップ</div>
              <div className={`mt-1 flex items-center gap-1 text-xs ${view.unlocked ? 'text-brand-400' : 'text-slate-500'}`}>
                {view.unlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {view.unlocked ? '全機能 解放済み' : '全ステップ完了で解放'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* フローチャート */}
        <div className="space-y-5 lg:col-span-2">
          {/* 各タスクへの導線 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/portal/onboarding/evidence" className="flex flex-col gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-4 transition hover:border-brand-500/40 hover:bg-brand-500/10">
              <ShieldCheck className="h-5 w-5 text-brand-400" />
              <div className="text-sm font-semibold text-white">本人確認・書類</div>
              <div className="text-[11px] text-slate-400">身分証・古物商の提出</div>
            </Link>
            <Link href="/portal/onboarding/funding" className="flex flex-col gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-4 transition hover:border-brand-500/40 hover:bg-brand-500/10">
              <Wallet className="h-5 w-5 text-brand-400" />
              <div className="text-sm font-semibold text-white">資金準備</div>
              <div className="text-[11px] text-slate-400">自己資金 / 資金調達</div>
            </Link>
            <Link href="/portal/onboarding/manual" className="flex flex-col gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-4 transition hover:border-brand-500/40 hover:bg-brand-500/10">
              <BookOpen className="h-5 w-5 text-brand-400" />
              <div className="text-sm font-semibold text-white">実践マニュアル</div>
              <div className="text-[11px] text-slate-400">チェック式で修了</div>
            </Link>
            <Link href="/portal/terms" className="flex flex-col gap-2 rounded-xl border border-carbon-700 bg-carbon-800/40 p-4 transition hover:border-brand-500/40 hover:bg-brand-500/10">
              <ScrollText className="h-5 w-5 text-brand-400" />
              <div className="text-sm font-semibold text-white">利用規約</div>
              <div className="text-[11px] text-slate-400">確認して同意</div>
            </Link>
          </div>

          <DarkCard>
            <DarkCardHeader title="スタートアップ ステップ" action={<span className="text-xs text-slate-500">全 {view.steps.length} ステップ</span>} />
            <DarkCardBody>
              <OnboardingFlow steps={view.steps} />
            </DarkCardBody>
          </DarkCard>
        </div>

        {/* サイド：フロー切替 + 解放される機能 + 注意 */}
        <div className="space-y-5">
          {flowInfo && <FlowSwitcher current={flowInfo.flow} canSwitch={flowInfo.canSwitch} />}
          <DarkCard>
            <DarkCardHeader title="完了で解放される機能" />
            <DarkCardBody className="space-y-2.5">
              {[
                { label: '仕入れオーダー', icon: <Rocket className="h-4 w-4" /> },
                { label: 'AI 相場検索', icon: <GraduationCap className="h-4 w-4" /> },
                { label: '販売実績の登録', icon: <FileText className="h-4 w-4" /> },
              ].map((f) => (
                <div key={f.label} className="flex items-center justify-between rounded-lg border border-carbon-700 bg-carbon-800/40 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="text-slate-500">{f.icon}</span>
                    {f.label}
                  </span>
                  {view.unlocked ? <Unlock className="h-3.5 w-3.5 text-brand-400" /> : <Lock className="h-3.5 w-3.5 text-slate-600" />}
                </div>
              ))}
            </DarkCardBody>
          </DarkCard>

          <div className="rounded-xl border border-carbon-700 bg-carbon-850/60 p-4 text-xs leading-relaxed text-slate-400">
            <p className="mb-2 font-semibold text-slate-300">進め方</p>
            <ul className="space-y-1.5">
              <li className="flex gap-2"><span className="text-brand-400">●</span> ステップは上から順に完了してください（飛ばせません）。</li>
              <li className="flex gap-2"><span className="text-brand-400">●</span> 「完了する」ボタンのタスクはご自身で完了できます。</li>
              <li className="flex gap-2"><span className="text-amber-400">●</span> 「本部確認中」は本部の確認をお待ちください。</li>
              <li className="flex gap-2"><span className="text-slate-500">●</span> 全ステップ完了で、すべての機能が解放されます。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
