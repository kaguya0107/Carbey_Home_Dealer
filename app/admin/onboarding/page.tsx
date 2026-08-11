import Link from 'next/link'
import { ArrowRight, ClipboardList, MessageSquare, AlertTriangle, CheckCircle2, Check, ShieldCheck, Eye } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listMembers } from '@/lib/portal/members'
import { mapOnboardingViews, type OnboardingView } from '@/lib/portal/onboarding'
import { listPendingEvidences } from '@/lib/portal/evidence'
import { MEMBER_STATUS_LABEL } from '@/lib/portal/labels'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { MemberStatus } from '@/types/database'
import { sendReminderAction } from './actions'
import { reviewEvidenceAction } from '../members/evidence-actions'

const EV_KIND_LABEL: Record<string, string> = { identity: '本人確認', antique_license: '古物商許可証', other: 'その他' }
const EV_DOC_LABEL: Record<string, string> = { license: '運転免許証', mynumber: 'マイナンバーカード', passport: 'パスポート', antique: '古物商許可証', other: 'その他' }

export const dynamic = 'force-dynamic'

// 進捗停滞の判定：稼働中(active)・進捗100%未満・登録から7日以上経過
const STALL_DAYS = 7
function isStalled(m: { status: string; pct: number; registration_date: string }): boolean {
  if (m.status !== 'active' || m.pct >= 100) return false
  const days = (Date.now() - new Date(m.registration_date).getTime()) / 86_400_000
  return days >= STALL_DAYS
}

export default async function AdminOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ reminded?: string }>
}) {
  await requireFeature('members')
  const [members, sp, pendingEvidences] = await Promise.all([listMembers(), searchParams, listPendingEvidences()])
  // 各加盟店のステップ内訳（③ 進捗ステッパー用）
  const views = await mapOnboardingViews(members.map((m) => m.id))

  const withProgress = members.map((m) => {
    const total = m.onboarding_total || 1
    const pct = Math.round((m.onboarding_done / total) * 100)
    return { ...m, pct, view: views.get(m.id), stalled: false as boolean }
  }).map((m) => ({ ...m, stalled: isStalled(m) }))

  const inProgress = withProgress.filter((m) => m.pct < 100).length
  const completed = withProgress.filter((m) => m.pct >= 100).length
  const stalledCount = withProgress.filter((m) => m.stalled).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">オンボーディング管理</h1>
        <p className="text-sm text-slate-500">加盟店ごとのスタートアップ進捗を確認・更新します。</p>
      </div>

      {sp.reminded && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> チャットでリマインドを送信しました。
        </div>
      )}

      {/* サマリ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Summary label="加盟店数" value={members.length} />
        <Summary label="進行中" value={inProgress} tone="text-brand-600" />
        <Summary label="停滞" value={stalledCount} tone="text-amber-600" />
        <Summary label="完了" value={completed} tone="text-emerald-600" />
      </div>

      {/* ⑪-② 承認待ちの提出書類（本部が行う唯一の手動作業。ここから直接承認できる） */}
      <Card>
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-brand-500" /> 承認待ちの提出書類
            {pendingEvidences.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{pendingEvidences.length}件</span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            加盟店が提出した本人確認書類などを承認すると、オンボーディングの該当ステップが自動で完了します。
          </p>
        </div>
        {pendingEvidences.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">承認待ちの書類はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingEvidences.map((ev) => {
              const url = `/api/portal/evidence/${ev.id}`
              const isImage = ev.file_type?.startsWith('image/')
              return (
                <li key={ev.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  {isImage ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" title="クリックで拡大" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={ev.file_name} className="h-11 w-11 rounded object-cover ring-1 ring-slate-200" loading="lazy" />
                    </a>
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Eye className="h-4 w-4" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {ev.member ? (
                        <Link href={`/admin/members/${ev.member.id}`} className="hover:text-brand-600 hover:underline">
                          {ev.member.company_name ?? ev.member.member_name}
                        </Link>
                      ) : '—'}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {EV_KIND_LABEL[ev.kind] ?? ev.kind}{ev.doc_type ? `・${EV_DOC_LABEL[ev.doc_type] ?? ev.doc_type}` : ''}
                      </span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{ev.file_name} ・ {new Date(ev.created_at).toLocaleString('ja-JP')}</div>
                  </div>
                  <form action={reviewEvidenceAction} className="flex items-center gap-2">
                    <input type="hidden" name="evidence_id" value={ev.id} />
                    <input type="hidden" name="member_id" value={ev.member?.id ?? ''} />
                    <input name="note" placeholder="却下理由（任意）" className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none" />
                    <button name="status" value="approved" className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">承認</button>
                    <button name="status" value="rejected" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">却下</button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* 一覧：進捗は横いっぱいのステッパーで、どの段階かが一目で分かるようにする（③） */}
      <Card>
        <div className="divide-y divide-slate-100">
          {withProgress.length === 0 && (
            <p className="px-5 py-10 text-center text-slate-400">加盟店がいません。</p>
          )}
          {withProgress.map((m) => (
            <div key={m.id} className="px-5 py-4 hover:bg-slate-50/60">
              {/* 見出し行：加盟店・ステータス・進捗率・操作 */}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{m.company_name ?? m.member_name}</div>
                  <div className="truncate text-xs text-slate-500">{m.member_name}</div>
                </div>
                <Badge tone={m.status === 'active' ? 'green' : m.status === 'pending' ? 'amber' : m.status === 'suspended' ? 'red' : 'slate'}>
                  {MEMBER_STATUS_LABEL[m.status as MemberStatus]}
                </Badge>
                {m.stalled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> 停滞
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <span className={`text-sm font-bold ${m.pct >= 100 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {m.pct}%
                  </span>
                  <span className="text-xs text-slate-400">{m.onboarding_done}/{m.onboarding_total}</span>
                  {m.stalled && (
                    <form action={sendReminderAction}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <button className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">
                        <MessageSquare className="h-3 w-3" /> リマインド
                      </button>
                    </form>
                  )}
                  <Link href={`/admin/onboarding/${m.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-info-600 hover:underline">
                    管理 <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* 進捗ステッパー（横いっぱい・段階名つき） */}
              <StepBar view={m.view} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/**
 * 横いっぱいの進捗ステッパー。各ステップの位置に段階名（契約・初期設定／本人確認・必要書類／
 * 資金準備／規約・実践マニュアル／運用開始準備）を出し、いま何をしている段階かを一目で示す。
 */
function StepBar({ view }: { view: OnboardingView | undefined }) {
  if (!view || view.steps.length === 0) {
    return <div className="text-xs text-slate-400">進捗データがありません。</div>
  }
  return (
    <ol className="flex w-full items-start">
      {view.steps.map((step, i) => {
        const done = step.status === 'done'
        const current = step.status === 'current'
        return (
          <li key={step.key} className="flex flex-1 items-start last:flex-none">
            <div className="flex min-w-0 flex-col items-center px-1 text-center">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                done ? 'bg-emerald-500 text-white'
                  : current ? 'border-2 border-brand-500 bg-brand-50 text-brand-600'
                  : 'border-2 border-slate-200 bg-white text-slate-300'
              }`}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`mt-1.5 text-[11px] leading-tight ${
                current ? 'font-semibold text-brand-600' : done ? 'text-slate-600' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
              <span className={`text-[10px] ${current ? 'text-brand-500' : done ? 'text-emerald-600' : 'text-slate-300'}`}>
                {done ? '完了' : current ? `進行中 ${step.done}/${step.total}` : step.locked ? '未着手' : ''}
              </span>
            </div>
            {/* ステップ間のバー（完了区間は緑で埋まる） */}
            {i < view.steps.length - 1 && (
              <div className="mt-3.5 h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${done ? 'w-full bg-emerald-500' : current ? 'w-1/2 bg-brand-400' : 'w-0'}`} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Summary({ label, value, tone = 'text-slate-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <ClipboardList className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  )
}
