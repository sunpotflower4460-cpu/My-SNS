'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import type { User, Workspace } from '@/lib/domain/types'
import { NAV_GROUPS, isNavActive } from './nav-items'

// The "その他" drawer on mobile — opened from the bottom nav's その他 tab. Lists
// every section (grouped, same source as the desktop sidebar) so the sections
// not in the 5-tab bar (分析 / 発信スタイル / チーム / 接続と設定) are still reachable.

interface MobileNavProps {
  workspace: Workspace
  user: User
  isOpen: boolean
  onClose: () => void
}

export default function MobileNav({ workspace, user, isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button aria-label="メニューを閉じる" onClick={onClose} className="absolute inset-0 bg-slate-950/30 backdrop-blur-md" />
      <aside className="ui-floating absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col rounded-r-container border-l-0">
        <div className="flex items-center justify-between border-b border-[color:var(--border-default)] px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-[color:var(--accent)] text-sm font-bold text-white shadow-[0_10px_24px_rgba(109,93,246,0.22)]">
              {workspace.name.charAt(0)}
            </div>
            <p className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] text-[color:var(--text-strong)]">{workspace.name}</p>
          </div>
          <button onClick={onClose} aria-label="メニューを閉じる" className="rounded-control p-2 text-[color:var(--text-muted)] transition duration-200 ease-[var(--ease-out-premium)] hover:bg-black/[0.045] hover:text-[color:var(--text-strong)]">
            <X aria-hidden className="h-5 w-5" />
          </button>
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
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-touch items-center gap-3 rounded-control px-3 text-sm transition duration-200 ease-[var(--ease-out-premium)] ${
                        active
                          ? 'bg-[color:var(--accent-soft)] font-medium text-[color:var(--accent)] shadow-[inset_0_0_0_1px_rgba(109,93,246,0.08)]'
                          : 'text-[color:var(--text-default)] hover:bg-white/75 hover:text-[color:var(--text-strong)]'
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
    </div>
  )
}
