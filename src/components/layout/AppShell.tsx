'use client'

import { useState } from 'react'
import type { User, Workspace, WorkspaceMember } from '@/lib/domain/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'
import MobileBottomNav from './MobileBottomNav'
import { useApp } from '@/lib/app/app-provider'
import { useAuth } from '@/lib/auth/auth-provider'

interface AppShellProps {
  children: React.ReactNode
  user: User
  workspace: Workspace
  member: WorkspaceMember
  pageTitle?: string
}

export default function AppShell({ children, user, workspace, pageTitle }: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { workspaceDataError, refreshWorkspaceData } = useApp()
  const { profileError } = useAuth()

  return (
    <div className="flex min-h-screen overflow-hidden bg-stone-50">
      <Sidebar workspace={workspace} user={user} />
      {/* Drawer for the sections not in the bottom bar (opened by その他). */}
      <MobileNav workspace={workspace} user={user} isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* The drawer for extra sections opens from the bottom nav's その他 tab,
            so the TopBar no longer carries a hamburger (one clear affordance). */}
        <TopBar workspace={workspace} pageTitle={pageTitle} />
        {/* Keep content clear of both the fixed bottom nav and the iOS home indicator
            when the app is launched in standalone/PWA mode. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 xl:pb-6">
          <div className="mx-auto w-full max-w-6xl">
            {profileError && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">プロフィールの一部を読み込めませんでした</p>
                <p className="mt-1 text-amber-800">
                  セッションは有効ですが、表示名などのプロフィール情報が不完全な可能性があります。ページを再読み込みしてください。
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
                >
                  再読み込み
                </button>
              </div>
            )}
            {workspaceDataError && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">ワークスペースデータの一部を読み込めませんでした</p>
                <p className="mt-1 text-amber-800">{workspaceDataError}</p>
                <button
                  type="button"
                  onClick={() => void refreshWorkspaceData()}
                  className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
                >
                  再読み込み
                </button>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
      <MobileBottomNav onOpenMore={() => setIsMobileNavOpen(true)} />
    </div>
  )
}
