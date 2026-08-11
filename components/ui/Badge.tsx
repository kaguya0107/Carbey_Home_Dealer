import { cn } from '@/lib/cn'

export type BadgeTone = 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'brand' | 'teal'

const TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-info-50 text-info-700',
  brand: 'bg-brand-50 text-brand-700',
  teal: 'bg-teal-50 text-teal-600',
}

/** ステータス等の小バッジ。 */
export function Badge({
  tone = 'slate',
  className,
  children,
  dot = false,
}: {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}
