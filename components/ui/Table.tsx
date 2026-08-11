import { cn } from '@/lib/cn'

/** データテーブル一式 (SaaS 基調)。 */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card scrollbar-slim">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
      {children}
    </thead>
  )
}

export function TH({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn('px-5 py-3 font-medium', className)}>{children}</th>
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn('transition hover:bg-slate-50/70', className)}>{children}</tr>
}

export function TD({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={cn('px-5 py-3.5 text-slate-700', className)}>{children}</td>
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  )
}
