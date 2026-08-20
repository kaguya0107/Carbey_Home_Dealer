import { requireStaff } from '@/lib/auth/session'
import SnapshotTabs from '@/components/admin/SnapshotTabs'
import MarketAnalysisPanel from '@/components/admin/MarketAnalysisPanel'
import { PREFECTURES } from '@/lib/portal/market-snapshot'

export const dynamic = 'force-dynamic'

export default async function AdminMarketAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ prefecture?: string }>
}) {
  await requireStaff()
  const sp = await searchParams
  // 都道府県別スナップショットからの導線：県名が PREFECTURES に一致するときだけ対象Aに反映。
  const initialPrefecture =
    sp.prefecture && (PREFECTURES as readonly string[]).includes(sp.prefecture) ? sp.prefecture : undefined

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SnapshotTabs active="analysis" />
      <p className="text-sm text-slate-500">
        蓄積した市場データ（直近30日ローリング）で、価格帯・年式・地域の分布を集計します。1つの条件で<strong>範囲分析</strong>、
        2つ並べて<strong>突合分析</strong>（例：同じ車種を地域A/Bで比較、車種A/Bを同条件で比較）ができます。
      </p>
      <MarketAnalysisPanel initialPrefecture={initialPrefecture} />
    </div>
  )
}
