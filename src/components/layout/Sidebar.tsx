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
    <aside className="hidden w-64 shrink-0 border-r border-stone-200 bg-white/90 backdrop-blur xl:flex xl:flex-col">
      <div className="border-b border-stone-200 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-card bg-violet-600 text-sm font-bold text-white">
            {workspace.name.charAt(0)}
          </div>
          <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{workspace.name}</p>
        </div>
        <Link
          href={CREATE_ACTION.href}
          className="mt-4 flex min-h-control items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {CREATE_ACTION.label}
        </Link>
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
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-control px-3 py-2 text-sm transition ${
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
  )
}
