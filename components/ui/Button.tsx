import Link from 'next/link'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600 hover:shadow-brand-500/30',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
}
const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
}

function classes(variant: Variant, size: Size, className?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-xl font-medium transition disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: { variant?: Variant; size?: Size } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  href,
  children,
}: {
  variant?: Variant
  size?: Size
  className?: string
  href: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
    </Link>
  )
}
