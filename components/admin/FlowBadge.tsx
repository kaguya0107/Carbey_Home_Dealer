import { Bot, Hand } from 'lucide-react'

/**
 * #48 案件の売買フロー（自動売買 / 半自動売買）を可視化するバッジ。
 * 車両進捗ボードのカード・案件詳細など、本部の各所で共通利用。
 */
export function FlowBadge({ flow, className = '' }: { flow: string | null | undefined; className?: string }) {
  const isAuto = flow === 'auto'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
        isAuto ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'
      } ${className}`}
      title={isAuto ? '自動売買（全自動フロー）の案件' : '半自動売買（セミオート）の案件'}
    >
      {isAuto ? <Bot className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
      {isAuto ? '自動売買' : '半自動売買'}
    </span>
  )
}
