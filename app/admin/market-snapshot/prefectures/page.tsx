import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { Card, CardBody } from '@/components/ui/Card'
import SnapshotTabs from '@/components/admin/SnapshotTabs'
import { getPrefectureSnapshots } from '@/lib/portal/market-snapshot'

export const dynamic = 'force-dynamic'

const DAY_OPTIONS = [1, 3, 7] as const

function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'たった今'
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

export default async function AdminPrefectureSnapshotPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  await requireStaff()
  const sp = await searchParams
  const days = DAY_OPTIONS.includes(Number(sp.days) as (typeof DAY_OPTIONS)[number]) ? Number(sp.days) : 3
  const snapshots = await getPrefectureSnapshots(days)
  const totalCount = snapshots.reduce((s, p) => s + p.count, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SnapshotTabs active="prefectures" />
      <p className="text-sm text-slate-500">
        取得済みデータから、都道府県ごとの<strong>新着（直近{days}日・収集日時ベース）</strong>のスナップショットを一括表示します。
        件数・相場・主要車種をひと目で把握し、各県から分析へ進めます。<span className="text-slate-400">※収集対象の県のみ表示されます。</span>
      </p>

      {/* 新着期間の切替 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">新着期間：</span>
        {DAY_OPTIONS.map((d) => (
          <Link
            key={d}
            href={`/admin/market-snapshot/prefectures?days=${d}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              d === days ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            直近{d}日
          </Link>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          {snapshots.length}県 ／ 計{totalCount.toLocaleString('ja-JP')}件
        </span>
      </div>

      {snapshots.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-slate-400">
            直近{days}日に収集されたデータがありません。期間を広げるか、「収集設定」で対象を確認してください。
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snapshots.map((p) => (
            <Card key={p.prefecture}>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-brand-500" /> {p.prefecture}
                  </div>
                  <span className="text-xs text-slate-400">最終収集 {fmtAgo(p.latestFetchedAt)}</span>
                </div>

                <div className="flex items-end gap-4">
                  <div>
                    <div className="text-[11px] text-slate-500">新着{days}日 件数</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {p.count.toLocaleString('ja-JP')}
                      <span className="ml-0.5 text-xs font-normal text-slate-400">件</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">中央価格</div>
                    <div className="text-lg font-bold text-brand-600">
                      {p.medianMan != null ? `${p.medianMan.toLocaleString('ja-JP')}万` : '—'}
                    </div>
                  </div>
                </div>

                {p.topCars.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] text-slate-400">主要車種</div>
                    <div className="flex flex-wrap gap-1">
                      {p.topCars.map((c) => (
                        <span key={c.car} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" title={`${c.car}：${c.count}件`}>
                          {c.car}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href={`/admin/market-snapshot/analysis?prefecture=${encodeURIComponent(p.prefecture)}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-info-600 hover:underline"
                >
                  この県で分析する <ArrowRight className="h-3 w-3" />
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        ※「新着」は収集日時（fetched_at）を基準にした直近{days}日の観測です。スクレイピングは変更せず、取得済みデータを絞り込んで表示しています。全国を広げるには「収集設定」で対象県を追加してください。
      </p>
    </div>
  )
}
