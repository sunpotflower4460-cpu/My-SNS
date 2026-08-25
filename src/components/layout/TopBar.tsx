'use client'

import type { Workspace } from '@/lib/domain/types'
import { useApp } from '@/lib/app/app-provider'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'

// Slimmed per §5.1: left carries page context; right holds only notifications,
// the workspace switcher (shown only when there is more than one workspace), and
// the avatar UserMenu. Name/email/role/logout moved into the UserMenu so the bar
// stays quiet. Mobile navigation lives in the bottom nav, not a TopBar hamburger.

interface TopBarProps {
  workspace: Workspace
  pageTitle?: string
}

export default function TopBar({ workspace, pageTitle }: TopBarProps) {
  const { workspaces } = useApp()
  const hasMultipleWorkspaces = workspaces.length > 1

  return (
    <header className="sticky top-0 z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border-default)] bg-white/72 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate font-medium tracking-[-0.01em] text-[color:var(--text-strong)]">{pageTitle ?? workspace.name}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <NotificationBell />
        {hasMultipleWorkspaces && <WorkspaceSwitcher workspace={workspace} />}
        <UserMenu />
      </div>
    </header>
  )
}
