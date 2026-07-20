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
      <button aria-label="メニューを閉じる" onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-violet-600 text-sm font-bold text-white">
              {workspace.name.charAt(0)}
            </div>
            <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{workspace.name}</p>
          </div>
          <button onClick={onClose} aria-label="メニューを閉じる" className="rounded-control p-2 text-gray-500 transition hover:bg-stone-50">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-4 last:mb-0">
              <p className="px-3 pb-1 text-[11px] font-semibold text-gray-400">{group.heading}</p>
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
                      className={`flex min-h-touch items-center gap-3 rounded-control px-3 text-sm transition ${
                        active ? 'bg-violet-50 font-medium text-violet-700' : 'text-gray-600 hover:bg-stone-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon aria-hidden className={`h-4 w-4 shrink-0 ${active ? 'text-violet-600' : 'text-gray-400'}`} />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-200 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-gray-700">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
