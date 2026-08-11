import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle, Loader2, Info } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { getMember } from '@/lib/portal/members'
import { listOnboardingTasks, buildOnboardingView, ensureOnboardingTasks, syncOnboardingStatus } from '@/lib/portal/onboarding'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { seedTasksAction, bulkSetTaskStatusAction } from '../actions'

export const dynamic = 'force-dynamic'

// ㊹ 各行のセグメント選択肢（自動判定タスクは先頭に「自動判定」）。値は t_<taskId> で一括送信。
const STATUS_OPTIONS = [
  { v: 'todo', label: '未着手', color: 'peer-checked:bg-slate-600' },
  { v: 'in_progress', label: '進行中', color: 'peer-checked:bg-brand-500' },
  { v: 'done', label: '完了', color: 'peer-checked:bg-emerald-500' },
] as const
const AUTO_OPTION = { v: 'auto', label: '自動判定', color: 'peer-checked:bg-amber-500' } as const

const STATUS_BADGE = {
  done: 'bg-emerald-50 text-emerald-700',
  current: 'bg-brand-50 text-brand-700',
  todo: 'bg-slate-100 text-slate-500',
} as const

export default async function AdminOnboardingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireFeature('members')
  const { id } = await params
  const sp = await searchParams
  const member = await getMember(id)
  if (!member) notFound()

  // タスクが無ければ生成（初回・保険）→ 実体（本人確認/資金/規約/マニュアル）と同期
  await ensureOnboardingTasks(id)
  await syncOnboardingStatus(id)
  const tasks = await listOnboardingTasks(id)
  const view = buildOnboardingView(tasks)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/onboarding" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> オンボーディング一覧へ
      </Link>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{member.company_name ?? member.member_name}</h1>
          <p className="text-sm text-slate-500">スタートアップ進捗の監視</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">{view.pct}%</div>
          <div className="text-xs text-slate-500">{view.doneTasks}/{view.totalTasks} タスク完了</div>
        </div>
      </div>

      {/* 自動化の説明バナー（完全自動化・レビュー⑯） */}
      <div className="flex items-start gap-2 rounded-xl border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-600" />
        <div>
          <p className="font-semibold">進捗はほぼ自動で進みます</p>
          <p className="mt-0.5 text-[13px] leading-relaxed">
            契約日の登録・加盟店の手続き（本人確認提出／資金／規約／マニュアル）に応じてタスクは自動で完了します。
            本部の手動操作が必要なのは<span className="font-semibold">本人確認書類の承認</span>のみです（下記「対応画面へ」から）。
            なお、動作確認や例外対応が必要な場合は<span className="font-semibold">自動判定のタスクも本部が強制的に切り替えられます</span>
            （上書き中は自動判定が止まります。「自動判定に戻す」で元の自動運用へ戻せます）。
          </p>
        </div>
      </div>

      {/* 進捗バー */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${view.pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${view.pct}%` }} />
      </div>

      {sp.saved && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> 進捗をまとめて更新しました。
        </div>
      )}

      {tasks.length === 0 ? (
        <Card>
          <CardBody className="flex items-center justify-between">
            <p className="text-sm text-slate-500">タスクがまだ生成されていません。</p>
            <form action={seedTasksAction}>
              <input type="hidden" name="member_id" value={id} />
              <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">既定タスクを生成</button>
            </form>
          </CardBody>
        </Card>
      ) : (
        // ㊹ 全タスクを1フォーム化：各行はラジオで選ぶだけ（都度実行しない）→ 末尾の「まとめて更新」で一括反映。
        <form action={bulkSetTaskStatusAction}>
          <input type="hidden" name="member_id" value={id} />
          <div className="space-y-6">
            {view.steps.map((step) => (
              <Card key={step.key}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {step.label}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[step.status]}`}>
                        {step.status === 'done' ? '完了' : step.status === 'current' ? '進行中' : '未着手'}
                      </span>
                    </span>
                  }
                  action={<span className="text-xs text-slate-400">{step.done}/{step.total}</span>}
                />
                <CardBody className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {step.tasks.map((t) => {
                      // ⑪-① 自動判定タスクは「自動判定」を選ぶと自動運用（上書き解除）。既定は上書き中なら現状態・そうでなければ自動判定。
                      const isLink = !!t.link_key
                      const defaultVal: string = isLink ? (t.admin_override ? t.status : 'auto') : t.status
                      const options = isLink ? [AUTO_OPTION, ...STATUS_OPTIONS] : STATUS_OPTIONS
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <span className={`flex items-center gap-2 text-sm ${t.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {t.status === 'done'
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              : t.status === 'in_progress'
                                ? <Loader2 className="h-4 w-4 text-brand-500" />
                                : <Circle className="h-4 w-4 text-slate-300" />}
                            {t.title}
                            {t.optional && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">任意</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            {isLink && (
                              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <Link href={`/admin/members/${id}`} className="text-brand-600 hover:underline">対応画面へ</Link>
                                {t.admin_override && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">上書き中</span>}
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              {options.map((o) => (
                                <label key={o.v} className="cursor-pointer">
                                  <input type="radio" name={`t_${t.id}`} value={o.v} defaultChecked={defaultVal === o.v} className="peer sr-only" />
                                  <span className={`inline-block rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 peer-checked:border-transparent peer-checked:text-white ${o.color}`}>{o.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* ㊹ まとめて更新（画面下に固定） */}
          <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-[11px] text-slate-500">変更したい行だけ状態を選び、まとめて更新できます。自動判定タスクは「自動判定」を選ぶと自動運用に戻ります。</p>
            <button className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-600">まとめて更新</button>
          </div>
        </form>
      )}
    </div>
  )
}
