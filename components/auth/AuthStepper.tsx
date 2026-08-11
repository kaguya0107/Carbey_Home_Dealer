import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export type Step = { label: string }

/** 認証フローのステップインジケーター (メール入力 → メール送信/再設定 → 確認/完了)。 */
export default function AuthStepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition',
                  done
                    ? 'bg-brand-500 text-white'
                    : active
                      ? 'bg-brand-500 text-white ring-4 ring-brand-100'
                      : 'bg-slate-200 text-slate-400',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('mt-1.5 whitespace-nowrap text-[11px]', active || done ? 'font-medium text-slate-700' : 'text-slate-400')}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-1 h-0.5 flex-1 rounded-full', done ? 'bg-brand-500' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
