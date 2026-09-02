'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Sprout, Inbox, Menu, Plus, Send, type LucideIcon } from 'lucide-react'
import { CREATE_ACTION, isNavActive } from './nav-items'

// The primary mobile navigation (below xl). Publishing is intentionally a
// first-class tab: on a phone the common flow is open app -> see today's work ->
// post, so /app/packs must not be hidden behind the "その他" drawer. Calendar
// remains available in that drawer through NAV_GROUPS.

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
  const hideFab = pathname === '/app/seeds/new' || pathname === '/app/drafts' || pathname.startsWith('/app/drafts/')

  const tabs: Tab[] = [
    { label: 'ホーム', href: '/app/dashboard', icon: LayoutGrid },
    { label: '発信', href: '/app/seeds', icon: Sprout },
    { label: '投稿', href: '/app/packs', icon: Send },
    { label: '受信箱', href: '/app/inbox', icon: Inbox },
    { label: 'その他', icon: Menu, onClick: onOpenMore },
  ]

  return (
    <>
      {!hideFab && (
        <Link
          href={CREATE_ACTION.href}
          aria-label={CREATE_ACTION.label}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent)] text-white shadow-[0_18px_38px_rgba(109,93,246,0.28)] transition duration-200 ease-[var(--ease-out-premium)] hover:bg-[color:var(--accent-hover)] active:scale-[0.985] xl:hidden"
        >
          <Plus aria-hidden className="h-6 w-6" />
        </Link>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[color:var(--border-default)] bg-white/82 pb-safe backdrop-blur-xl xl:hidden">
        {tabs.map((tab) => {
          const active = tab.href ? isNavActive(pathname, tab.href) : false
          const Icon = tab.icon
          const inner = (
            <>
              <Icon aria-hidden className={`h-5 w-5 transition duration-200 ${active ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-subtle)]'}`} />
              <span className={active ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]'}>{tab.label}</span>
            </>
          )
          const className = `flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition duration-200 ease-[var(--ease-out-premium)] ${
            active ? 'bg-[color:rgba(109,93,246,0.06)]' : 'hover:bg-white/70'
          }`
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
