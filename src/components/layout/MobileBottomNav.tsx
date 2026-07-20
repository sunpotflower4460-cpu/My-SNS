'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Sprout, Inbox, CalendarDays, Menu, Plus, type LucideIcon } from 'lucide-react'
import { CREATE_ACTION, isNavActive } from './nav-items'

// The primary mobile navigation (below xl). Five one-tap entries; the "その他"
// entry opens the full drawer for the remaining sections. A floating create
// button sits above it so 新しい発信 is always one tap away. Replaces the old
// hamburger-only drawer as the main way to move around on a phone.

interface MobileBottomNavProps {
  onOpenMore: () => void
}

interface Tab {
  label: string
  href?: string
  icon: LucideIcon
  onClick?: () => void
}

export default function MobileBottomNav({ onOpenMore }: MobileBottomNavProps) {
  const pathname = usePathname()

  const tabs: Tab[] = [
    { label: 'ホーム', href: '/app/dashboard', icon: LayoutGrid },
    { label: '発信', href: '/app/seeds', icon: Sprout },
    { label: '受信箱', href: '/app/inbox', icon: Inbox },
    { label: '予定', href: '/app/calendar', icon: CalendarDays },
    { label: 'その他', icon: Menu, onClick: onOpenMore },
  ]

  return (
    <>
      <Link
        href={CREATE_ACTION.href}
        aria-label={CREATE_ACTION.label}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition hover:bg-gray-700 xl:hidden"
      >
        <Plus aria-hidden className="h-6 w-6" />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white/95 pb-safe backdrop-blur xl:hidden">
        {tabs.map((tab) => {
          const active = tab.href ? isNavActive(pathname, tab.href) : false
          const Icon = tab.icon
          const inner = (
            <>
              <Icon aria-hidden className={`h-5 w-5 ${active ? 'text-violet-600' : 'text-gray-400'}`} />
              <span className={active ? 'text-violet-700' : 'text-gray-500'}>{tab.label}</span>
            </>
          )
          const className = 'flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium'
          return tab.href ? (
            <Link key={tab.label} href={tab.href} aria-current={active ? 'page' : undefined} className={className}>
              {inner}
            </Link>
          ) : (
            <button key={tab.label} type="button" onClick={tab.onClick} className={className}>
              {inner}
            </button>
          )
        })}
      </nav>
    </>
  )
}
