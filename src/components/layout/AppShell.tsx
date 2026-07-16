'use client'

import { useState } from 'react'
import type { User, Workspace, WorkspaceMember } from '@/lib/domain/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'

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
      <MobileNav workspace={workspace} user={user} isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar workspace={workspace} pageTitle={pageTitle} onMenuClick={() => setIsMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
