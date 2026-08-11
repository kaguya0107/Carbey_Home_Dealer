import { cn } from '@/lib/cn'

/** ダークテーマのカード面（ガラス調・細ボーダー）。 */
export function DarkCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-carbon-700 bg-carbon-850/80 backdrop-blur-sm', className)}>
      {children}
    </div>
  )
}

export function DarkCardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between border-b border-carbon-700 px-5 py-3.5', className)}>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {action}
    </div>
  )
}

export function DarkCardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

type Trend = { value: string; dir?: 'up' | 'down' }

/**
 * ダーク KPI タイル。ラベル + 大きな数値 + 増減 + 右側の任意ビジュアル（スパークライン/ドーナツ等）。
 */
export function DarkStat({
  label,
  value,
  unit,
  trend,
  sub,
  visual,
  accent = false,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  trend?: Trend
  sub?: string
  visual?: React.ReactNode
  /** 赤グロー枠で強調 */
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-carbon-850/80 p-4 backdrop-blur-sm',
        accent ? 'border-brand-500/40 glow-brand' : 'border-carbon-700',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-400">{label}</div>
          <div className="mt-1.5 flex items-end gap-1">
            <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
            {unit && <span className="mb-0.5 text-sm text-slate-400">{unit}</span>}
          </div>
          {trend && (
            <div className={cn('mt-1 text-xs font-semibold', trend.dir === 'down' ? 'text-rose-400' : 'text-brand-400')}>
              {trend.dir === 'down' ? '↓' : '↑'} {trend.value}
              {sub && <span className="ml-1 font-normal text-slate-500">{sub}</span>}
            </div>
          )}
          {!trend && sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        {visual && <div className="shrink-0">{visual}</div>}
      </div>
    </div>
  )
}
