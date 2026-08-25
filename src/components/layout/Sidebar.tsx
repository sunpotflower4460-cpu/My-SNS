'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { User, Workspace } from '@/lib/domain/types'
import { CREATE_ACTION, NAV_GROUPS, isNavActive } from './nav-items'

interface SidebarProps {
  workspace: Workspace
  user: User
}

export default function Sidebar({ workspace, user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden w-72 shrink-0 border-r border-[color:var(--border-default)] bg-white/72 backdrop-blur-xl xl:flex xl:flex-col">
      <div className="border-b border-[color:var(--border-default)] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-card bg-[color:var(--accent)] text-sm font-bold text-white shadow-[0_10px_24px_rgba(109,93,246,0.22)]">
            {workspace.name.charAt(0)}
          </div>
          <p className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] text-[color:var(--text-strong)]">{workspace.name}</p>
        </div>
        <Link
          href={CREATE_ACTION.href}
          className="mt-4 flex min-h-control items-center justify-center gap-2 rounded-full bg-[color:var(--accent)] px-4 text-sm font-medium text-white shadow-[0_10px_24px_rgba(109,93,246,0.22)] transition duration-200 ease-[var(--ease-out-premium)] hover:bg-[color:var(--accent-hover)] active:scale-[0.985]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {CREATE_ACTION.label}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-4 last:mb-0">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-[color:var(--text-subtle)]">{group.heading}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isNavActive(pathname, item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition duration-200 ease-[var(--ease-out-premium)] ${
                      active
                        ? 'bg-[color:var(--accent-soft)] font-medium text-[color:var(--accent)] shadow-[inset_0_0_0_1px_rgba(109,93,246,0.08)]'
                        : 'text-[color:var(--text-default)] hover:bg-white/80 hover:text-[color:var(--text-strong)]'
                    }`}
                  >
                    <Icon aria-hidden className={`h-4 w-4 shrink-0 ${active ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-subtle)]'}`} />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--border-default)] px-4 py-4">
        <div className="glass-surface flex items-center gap-3 rounded-card border border-[color:var(--border-default)] px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-xs font-medium text-[color:var(--text-default)]">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[color:var(--text-strong)]">{user.name}</p>
            <p className="truncate text-xs text-[color:var(--text-muted)]">{user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
