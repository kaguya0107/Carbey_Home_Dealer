'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = { href: string; label: string }

export default function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700'
                : 'rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100'
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
