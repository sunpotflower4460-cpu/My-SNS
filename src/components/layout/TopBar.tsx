'use client'

import type { Workspace } from '@/lib/domain/types'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace'
import RoleBadge from '@/components/ui/RoleBadge'
import WorkspaceSwitcher from './WorkspaceSwitcher'

interface TopBarProps {
  workspace: Workspace
  pageTitle?: string
}

export default function TopBar({ workspace, pageTitle }: TopBarProps) {
  const router = useRouter()
  const { currentUser, signOut } = useCurrentUser()
  const { currentMember } = useCurrentWorkspace()

  const handleSignOut = () => {
    signOut()
    router.replace('/login')
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="truncate text-gray-400">{workspace.name}</span>
        {pageTitle && (
          <>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-700">{pageTitle}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <WorkspaceSwitcher workspace={workspace} />
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
            {currentUser?.name.charAt(0) ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{currentUser?.name}</p>
            <p className="truncate text-xs text-gray-500">{currentUser?.email ?? 'No email'}</p>
          </div>
          <div className="hidden sm:block">
            <RoleBadge role={currentMember?.role ?? 'viewer'} />
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-stone-300 hover:text-gray-900"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}
