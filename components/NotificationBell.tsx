import Link from 'next/link'
import { Bell } from 'lucide-react'

export default function NotificationBell({ count, href }: { count: number; href: string }) {
  return (
    <Link href={href} className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="通知">
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-medium text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
