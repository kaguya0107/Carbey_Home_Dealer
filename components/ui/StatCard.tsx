import Link from 'next/link'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'brand' | 'blue' | 'green' | 'amber' | 'slate' | 'teal'

const ICON_TONES: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  blue: 'bg-info-50 text-info-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-500',
  teal: 'bg-teal-50 text-teal-600',
}

const RING_COLORS: Record<Tone, string> = {
  brand: '#fb2c1d',
  blue: '#1d5cf0',
  green: '#10b981',
  amber: '#f59e0b',
  slate: '#94a3b8',
  teal: '#06b6d4',
}

/** ダッシュボードの KPI タイル。 */
export function StatCard({
  label,
  value,
  icon,
  tone = 'slate',
  sub,
  href,
  delta,
  badge,
  ring,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  tone?: Tone
  sub?: React.ReactNode
  href?: string
  /** 増減バッジ (例: { value: 12, dir: 'up' }) → ↑12 を value 横に表示 */
  delta?: { value: string | number; dir?: 'up' | 'down' }
  /** ラベル横の小バッジ (例: 「要対応」) */
  badge?: { label: string; tone?: 'amber' | 'brand' }
  /** value 右のミニドーナツリング (0-100) */
  ring?: number
}) {
  const inner = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        {icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', ICON_TONES[tone])}>{icon}</span>
        )}
        {badge && (
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
              badge.tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600',
            )}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div className="mt-3 text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 flex items-end justify-between">
        <div className="flex items-end gap-2">
          <div className="text-2xl font-bold tracking-tight text-slate-900">{value}</div>
          {delta && (
            <span
              className={cn(
                'mb-1 flex items-center gap-0.5 text-xs font-semibold',
                delta.dir === 'down' ? 'text-red-500' : 'text-emerald-600',
              )}
            >
              {delta.dir === 'down' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {delta.value}
            </span>
          )}
        </div>
        {ring != null && <MiniRing pct={ring} color={RING_COLORS[tone]} />}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function MiniRing({ pct, color }: { pct: number; color: string }) {
  const r = 16
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`} />
      <text x="20" y="21" textAnchor="middle" className="rotate-90 fill-slate-700 text-[9px] font-bold" style={{ transformOrigin: '20px 20px' }}>
        {pct}%
      </text>
    </svg>
  )
}
