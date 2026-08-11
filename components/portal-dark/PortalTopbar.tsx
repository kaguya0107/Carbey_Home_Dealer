import Link from 'next/link'
import { MessageSquare, ChevronDown } from 'lucide-react'
import RealtimeBell from '@/components/shell/RealtimeBell'
import SignOutButton from '@/components/SignOutButton'

/** 加盟店ダークテーマのトップバー。通知ベル + チャット + ユーザー(氏名/加盟店ID)。 */
export default function PortalTopbar({
  userName,
  memberCode,
  userId,
  unread,
  chatUnread = 0,
}: {
  userName: string
  memberCode: string
  userId: string
  unread: number
  chatUnread?: number
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-end gap-2 border-b border-carbon-700 bg-carbon-900/80 px-4 backdrop-blur sm:px-6">
      <RealtimeBell href="/portal/chat" initialUnread={unread} scope="user" userId={userId} variant="dark" />
      <Link href="/portal/chat" className="relative rounded-lg p-2 text-slate-300 hover:bg-white/5" aria-label="チャット">
        <MessageSquare className="h-5 w-5" />
        {chatUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
            {chatUnread > 99 ? '99+' : chatUnread}
          </span>
        )}
      </Link>

      <div className="ml-1 flex items-center gap-2.5 border-l border-carbon-700 pl-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white ring-2 ring-white/10">
          {userName.charAt(0)}
        </div>
        <div className="hidden text-right leading-tight sm:block">
          <div className="text-sm font-medium text-white">{userName} 様</div>
          <div className="text-[11px] text-slate-500">加盟店ID：{memberCode}</div>
        </div>
        <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" />
        <SignOutButton />
      </div>
    </header>
  )
}
