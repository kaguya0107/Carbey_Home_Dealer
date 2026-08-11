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
      <SnapshotTemplateManager templates={templates} />
    </div>
  )
}
