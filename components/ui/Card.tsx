import { cn } from '@/lib/cn'

/** 基本カード。SaaS の基調となる白面 + 細ボーダー + 微シャドウ。 */
export function Card({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white shadow-card', className)}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between border-b border-slate-100 px-5 py-4', className)}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {action}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
