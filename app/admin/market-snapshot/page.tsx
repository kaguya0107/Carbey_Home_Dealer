import { CheckCircle2, AlertTriangle, Clock, Database, Radar, RefreshCw } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import SnapshotTabs from '@/components/admin/SnapshotTabs'
import {
  getSnapshotStatus,
  getRecentRuns,
  getDailyIngest,
  getPrefectureCoverage,
  getMakerNames,
} from '@/lib/portal/market-snapshot'
import { requeueSnapshotAction } from './actions'

export const dynamic = 'force-dynamic'

// --- 表示ヘルパ（Asia/Tokyo） ---
const JST = 'Asia/Tokyo'
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: JST,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function fmtDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${Number(m)}/${Number(d)}`
}
function ageLabel(iso: string | null): string {
  if (!iso) return '未取得'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'たった今'
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}
/** 鮮度の色分け（<24h=良好, <72h=やや古い, それ以上=要確認） */
function freshness(ageHours: number | null): { label: string; cls: string } {
  if (ageHours === null) return { label: '未取得', cls: 'bg-slate-100 text-slate-500' }
  if (ageHours < 24) return { label: '新鮮', cls: 'bg-emerald-50 text-emerald-700' }
  if (ageHours < 72) return { label: 'やや古い', cls: 'bg-amber-50 text-amber-700' }
  return { label: '要確認', cls: 'bg-rose-50 text-rose-700' }
}

export default async function AdminMarketSnapshotPage({
  searchParams,
}: {
  searchParams: Promise<{ requeue?: string; at?: string }>
}) {
  await requireStaff()
  const sp = await searchParams
  const [status, runs, daily, coverage, makerNames] = await Promise.all([
    getSnapshotStatus(),
    getRecentRuns(20),
    getDailyIngest(14),
    getPrefectureCoverage(),
    getMakerNames(),
  ])

  const makerLabel = (codes: string[]) =>
    codes.length ? codes.map((c) => makerNames[c] ?? c).join('・') : '—'

  const dailyMax = Math.max(1, ...daily.map((d) => d.rows))
  const obsFresh = freshness(
    status.lastObservationAt
      ? Math.floor((Date.now() - new Date(status.lastObservationAt).getTime()) / 3_600_000)
      : null,
  )
  const coveredCount = coverage.filter((c) => c.covered).length
  const uncoveredCount = coverage.length - coveredCount

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SnapshotTabs active="status" />
      <p className="text-sm text-slate-500">
        カーセンサー市場データの自動収集（VPS）の稼働状況・鮮度・カバレッジを監視します。取得は自動で継続され、この画面は状況の確認用です。
      </p>

      {sp.requeue === 'ok' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          再取得を予約しました。{sp.at ? `次の取得時刻（${sp.at}）` : '次の取得時刻'}の巡回で自動的に再収集されます（3日クールダウンを解除しました）。
        </div>
      )}
      {sp.requeue === 'disabled' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          対象テンプレが「無効」のため再取得されません。「収集設定」で有効化してください。
        </div>
      )}
      {sp.requeue === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          再取得の予約に失敗しました（対象テンプレが見つからない可能性があります）。
        </div>
      )}

      {/* サマリ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" /> データ鮮度
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">{ageLabel(status.lastObservationAt)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${obsFresh.cls}`}>{obsFresh.label}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">最新取得 {fmtDateTime(status.lastObservationAt)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Database className="h-3.5 w-3.5" /> 保持中の観測件数
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {status.totalObservations.toLocaleString('ja-JP')}
              <span className="ml-1 text-sm font-normal text-slate-400">件</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">直近30日ローリング</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs text-slate-500">直近24時間の取込</div>
            <div className="mt-1 text-2xl font-bold text-brand-600">
              +{status.ingested24h.toLocaleString('ja-JP')}
              <span className="ml-1 text-sm font-normal text-slate-400">件</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">直近成功 {fmtDateTime(status.lastSuccessAt)}</div>
          </CardBody>
        </Card>
        <Card className={uncoveredCount > 0 ? 'border-amber-200' : undefined}>
          <CardBody>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Radar className="h-3.5 w-3.5" /> 収集対象エリア
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-900">{coveredCount}</span>
              <span className="text-sm font-normal text-slate-400">/ 47県</span>
              {uncoveredCount > 0 && <AlertTriangle className="ml-1 h-4 w-4 text-amber-500" />}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {uncoveredCount > 0 ? `${uncoveredCount}県が現在の自動収集対象外` : '全県を収集中'}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 日別取込 */}
      <Card>
        <CardHeader title="日別の取込件数（直近14日）" />
        <CardBody>
          <div className="flex items-end gap-1.5" style={{ height: 140 }}>
            {daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full text-center text-[10px] tabular-nums text-slate-400">
                  {d.rows > 0 ? (d.rows >= 1000 ? `${Math.round(d.rows / 1000)}k` : d.rows) : ''}
                </div>
                <div
                  className="w-full rounded-t bg-brand-400/80"
                  style={{ height: Math.max(2, Math.round((d.rows / dailyMax) * 100)) }}
                  title={`${d.date}：${d.rows.toLocaleString('ja-JP')}件 / ${d.runs}回`}
                />
                <div className="text-[10px] text-slate-400">{fmtDay(d.date)}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 実行履歴 */}
        <Card>
          <CardHeader
            title={
              <span className="flex flex-col">
                直近の実行履歴
                <span className="flex items-center gap-1 text-xs font-normal text-slate-400">
                  {status.successRate7d !== null && (
                    <>
                      {status.successRate7d >= 90 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      直近7日 成功率 {status.successRate7d}%（{status.runs7d}回）
                    </>
                  )}
                </span>
              </span>
            }
          />
          <CardBody>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-white text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">完了</th>
                    <th className="px-2 py-2 font-medium">対象</th>
                    <th className="px-2 py-2 text-right font-medium">取込</th>
                    <th className="px-2 py-2 text-center font-medium">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-8 text-center text-slate-400">実行履歴がありません。</td></tr>
                  )}
                  {runs.map((r) => {
                    const isFailed = !['success', 'running', 'pending'].includes(r.status)
                    return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-2 py-2 align-top tabular-nums text-slate-600">{fmtDateTime(r.completedAt ?? r.startedAt)}</td>
                      <td className="px-2 py-2 align-top text-slate-700">
                        <div className="max-w-[240px] truncate" title={`${makerLabel(r.makerCodes)} / ${r.prefectures.join('・') || '—'}`}>
                          {r.prefectures.join('・') || '—'}
                        </div>
                        <div className="max-w-[240px] truncate text-xs text-slate-400">{makerLabel(r.makerCodes)}</div>
                        {isFailed && r.errorMessage && (
                          <div className="mt-1 max-w-[260px] truncate text-[11px] text-rose-500" title={r.errorMessage}>⚠ {r.errorMessage}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right align-top tabular-nums text-slate-700">{(r.rowsIngested ?? 0).toLocaleString('ja-JP')}</td>
                      <td className="px-2 py-2 text-center align-top">
                        {r.status === 'success' ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">成功</span>
                        ) : r.status === 'running' || r.status === 'pending' ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">実行中</span>
                        ) : (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">失敗</span>
                        )}
                        {isFailed && r.templateId && (
                          <form action={requeueSnapshotAction} className="mt-1.5">
                            <input type="hidden" name="templateId" value={r.templateId} />
                            <button
                              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                              title="このテンプレの3日クールダウンを解除し、次の取得時刻で再収集します"
                            >
                              <RefreshCw className="h-3 w-3" /> 再取得
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* カバレッジ／鮮度 */}
        <Card>
          <CardHeader
            title={
              <span className="flex flex-col">
                都道府県カバレッジ／鮮度
                <span className="text-xs font-normal text-slate-400">
                  直近30日の実収集：{coveredCount}県を収集中
                  {uncoveredCount > 0 && ` ／ ${uncoveredCount}県は対象外（網羅性の拡大余地）`}
                </span>
              </span>
            }
          />
          <CardBody>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-white text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">都道府県</th>
                    <th className="px-2 py-2 text-right font-medium">観測数</th>
                    <th className="px-2 py-2 font-medium">最終収集</th>
                    <th className="px-2 py-2 text-center font-medium">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coverage.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-8 text-center text-slate-400">カバレッジ情報がありません。</td></tr>
                  )}
                  {coverage.map((c) => {
                    const f = freshness(c.ageHours)
                    return (
                      <tr key={c.prefecture} className={`hover:bg-slate-50 ${c.covered ? '' : 'text-slate-400'}`}>
                        <td className="px-2 py-2">{c.prefecture}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {c.covered ? c.listingCount.toLocaleString('ja-JP') : '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                          {c.covered ? ageLabel(c.lastScrapeAt) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {c.covered ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.cls}`}>{f.label}</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">対象外</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>

      <p className="text-xs text-slate-400">
        ※ 実際の取得は常時稼働のVPSスクレイパが自動で行います。この画面は「稼働しているか／どこが古いか」を確認するための監視ビューです（アプリ内の別スケジューラ設定は本収集に影響しません）。
      </p>
    </div>
  )
}
