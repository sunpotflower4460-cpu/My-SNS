'use client'

import { useState } from 'react'
import type { User, Workspace, WorkspaceMember } from '@/lib/domain/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'
import MobileBottomNav from './MobileBottomNav'

interface AppShellProps {
  children: React.ReactNode
  user: User
  workspace: Workspace
  member: WorkspaceMember
  pageTitle?: string
}

export default function AppShell({ children, user, workspace, member, pageTitle }: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen overflow-hidden bg-stone-50">
      <Sidebar workspace={workspace} user={user} member={member} />
      {/* Drawer for the sections not in the mobile bottom bar (opened by その他). */}
      <MobileNav workspace={workspace} user={user} isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* The drawer for extra sections opens from the bottom nav's その他 tab,
            so the TopBar no longer carries a hamburger (one clear affordance). */}
        <TopBar workspace={workspace} pageTitle={pageTitle} />
        {/* Extra bottom padding below xl so content clears the fixed bottom nav. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-28 sm:px-6 lg:px-8 xl:pb-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <MobileBottomNav onOpenMore={() => setIsMobileNavOpen(true)} />
    </div>
  )
}
