'use client'

import type { Workspace } from '@/lib/domain/types'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace'
import WorkspaceSwitcher from './WorkspaceSwitcher'

interface TopBarProps {
  workspace: Workspace
  pageTitle?: string
}

export default function TopBar({ workspace, pageTitle }: TopBarProps) {
  const { currentUser, signOut } = useCurrentUser()
  const { currentMember } = useCurrentWorkspace()

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="truncate text-gray-400">{workspace.name}</span>
        {pageTitle && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 font-medium">{pageTitle}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher workspace={workspace} />
        <div className="hidden items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 sm:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
            {currentUser?.name.charAt(0) ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{currentUser?.name}</p>
            <p className="text-xs text-gray-500">{currentMember?.role ?? 'member'}</p>
          </div>
          <button
            onClick={signOut}
            className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-stone-300 hover:text-gray-900"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}
