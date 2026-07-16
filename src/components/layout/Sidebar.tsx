'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { User, Workspace, WorkspaceMember } from '@/lib/domain/types'

interface NavItem {
  label: string
  href: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: '⊞' },
  { label: 'Seeds', href: '/app/seeds', icon: '🌱' },
  { label: 'Brand Profile', href: '/app/brand', icon: '◌' },
  { label: 'Drafts', href: '/app/drafts', icon: '✏️' },
  { label: 'Queue', href: '/app/queue', icon: '📅' },
  { label: 'Analytics', href: '/app/analytics', icon: '📊' },
  { label: 'Inbox', href: '/app/inbox', icon: '📬' },
  { label: 'Team', href: '/app/team', icon: '👥' },
  { label: 'Settings', href: '/app/settings', icon: '⚙️' },
]

interface SidebarProps {
  workspace: Workspace
  user: User
  member: WorkspaceMember
}

export default function Sidebar({ workspace, user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden w-72 shrink-0 border-r border-stone-200 bg-white/90 backdrop-blur xl:flex xl:flex-col">
      <div className="border-b border-stone-200 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-200">
            {workspace.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{workspace.name}</p>
            <p className="text-xs text-gray-500">Quiet creator workspace</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                isActive
                  ? 'border border-violet-200 bg-violet-50 text-violet-700 shadow-sm shadow-violet-100/40'
                  : 'border border-transparent text-gray-600 hover:border-stone-200 hover:bg-stone-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {isActive && <span className="text-xs font-semibold uppercase tracking-[0.18em]">Now</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-stone-200 px-5 py-5">
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-gray-700">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
