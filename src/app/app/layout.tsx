'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import EmptyState from '@/components/ui/EmptyState'
import { useMockApp } from '@/lib/mock/store/provider'
import { useMockSession } from '@/lib/session/mock-session'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { currentUser, isAuthenticated, isReady: sessionReady, signOut } = useMockSession()
  const { currentWorkspace, currentMember, isReady: appReady } = useMockApp()

  useEffect(() => {
    if (sessionReady && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, router, sessionReady])

  if (!sessionReady || !appReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
        <div className="rounded-3xl border border-stone-200 bg-white px-6 py-5 text-sm text-gray-500 shadow-sm">
          Loading workspace…
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !currentUser) {
    return null
  }

  if (!currentWorkspace || !currentMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
        <div className="w-full max-w-xl">
          <EmptyState
            title="No workspace available"
            description="This mock account does not have an active workspace yet, or the stored workspace is stale."
            action={
              <button
                onClick={() => {
                  signOut()
                  router.replace('/login')
                }}
                className="rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-stone-50"
              >
                Back to login
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <AppShell user={currentUser} workspace={currentWorkspace} member={currentMember}>
      {children}
    </AppShell>
  )
}
