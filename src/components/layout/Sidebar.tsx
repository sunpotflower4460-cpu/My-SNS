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
  { label: 'Content', href: '/app/content', icon: '📄' },
  { label: 'Drafts', href: '/app/drafts', icon: '✏️' },
  { label: 'Queue', href: '/app/queue', icon: '📅' },
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
    <aside className="w-60 flex flex-col bg-white border-r border-gray-200 shrink-0">
      {/* Logo / Workspace Name */}
      <div className="px-5 py-5 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white text-sm font-bold">
            {workspace.name.charAt(0)}
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate">{workspace.name}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Current User */}
      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium shrink-0">
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
