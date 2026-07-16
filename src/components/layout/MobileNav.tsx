'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { User, Workspace } from '@/lib/domain/types'
import { NAV_ITEMS } from './nav-items'

// Below xl, Sidebar.tsx renders nothing at all — this is the only way a
// signed-in user can navigate between /app/* sections on a phone or tablet.
// Uses the same NAV_ITEMS as Sidebar so the two surfaces can't drift apart.

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
    <div className="fixed inset-0 z-40 xl:hidden">
      <button
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
      />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-200">
              {workspace.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{workspace.name}</p>
              <p className="text-xs text-gray-500">Quiet creator workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-xl border border-stone-200 p-2 text-gray-500 transition hover:bg-stone-50"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'border border-violet-200 bg-violet-50 text-violet-700 shadow-sm shadow-violet-100/40'
                    : 'border border-transparent text-gray-600 hover:border-stone-200 hover:bg-stone-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-stone-200 px-5 py-5">
          <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-gray-700">
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
