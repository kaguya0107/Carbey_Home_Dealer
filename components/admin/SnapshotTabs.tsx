import Link from 'next/link'
import { Radar, Activity, SlidersHorizontal, GitCompareArrows } from 'lucide-react'

/** 市場スナップショットの本部ページ共通タブ（監視 / 設定 / 分析）。単一ナビ項目の下で切替。 */
export default function SnapshotTabs({ active }: { active: 'status' | 'settings' | 'analysis' }) {
  const tabs = [
    { key: 'status', href: '/admin/market-snapshot', label: '収集状況', icon: Activity },
    { key: 'settings', href: '/admin/market-snapshot/settings', label: '収集設定', icon: SlidersHorizontal },
    { key: 'analysis', href: '/admin/market-snapshot/analysis', label: '突合・範囲分析', icon: GitCompareArrows },
  ] as const

  return (
    <div>
      <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
        <Radar className="h-5 w-5 text-brand-500" /> 市場スナップショット
      </h1>
      <div className="mt-3 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const on = t.key === active
          const Icon = t.icon
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                on
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
