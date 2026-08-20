import { requireStaff } from '@/lib/auth/session'
import SnapshotTabs from '@/components/admin/SnapshotTabs'
import SnapshotTemplateManager from '@/components/admin/SnapshotTemplateManager'
import { listTemplates } from '@/lib/portal/snapshot-config'

export const dynamic = 'force-dynamic'

export default async function AdminMarketSnapshotSettingsPage() {
  await requireStaff()
  const templates = await listTemplates()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SnapshotTabs active="settings" />
      <p className="text-sm text-slate-500">
        自動収集の「巡回対象」を管理します。ここで有効化した対象県×メーカーを、VPSが設定時刻に自動でスクレイピングします（人的操作なしで継続）。
        <span className="text-slate-400">※この設定は分析サイトの定期取得とも共有されます。</span>
      </p>
      <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-slate-600">
        💡 <strong className="text-slate-800">2種類を同時に展開したいとき</strong>：同じ<strong>取得時刻</strong>を2つのテンプレに設定すると、同一の巡回タイミングで<strong>両方が同時に収集</strong>されます（例：関西×トヨタ系と関西×輸入車を同時刻に設定）。時刻を分散すればVPS負荷は平準化されます。
      </div>
      <SnapshotTemplateManager templates={templates} />
    </div>
  )
}
