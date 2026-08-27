'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/app/app-provider'
import { useAuth } from '@/lib/auth/auth-provider'

const MAX_AUTOMATIC_RETRIES = 3

/**
 * Prevents stale workspace data from becoming visible when two asynchronous
 * refreshes finish out of order during a rapid workspace switch.
 *
 * AppProvider persists the selected workspace id before starting its refresh.
 * If an older request later wins the race and writes its workspace back into
 * context, this guard hides that stale snapshot and asks AppProvider to reload
 * the currently selected workspace again.
 */
export default function WorkspaceConsistencyGuard({ children }: { children: React.ReactNode }) {
  const { currentUserId, isReady: authReady } = useAuth()
  const { currentWorkspace, refreshWorkspaceData } = useApp()
  const [expectedWorkspaceId, setExpectedWorkspaceId] = useState<string | null | undefined>(undefined)
  const [retryCount, setRetryCount] = useState(0)
  const refreshingFor = useRef<string | null>(null)

  // refreshWorkspaceData gets a new identity when AppProvider's active
  // workspace changes, so this also observes same-tab localStorage switches
  // (the browser `storage` event alone does not fire in the tab that wrote it).
  useEffect(() => {
    if (!authReady || !currentUserId) {
      setExpectedWorkspaceId(null)
      setRetryCount(0)
      refreshingFor.current = null
      return
    }
    setExpectedWorkspaceId(localStorage.getItem('activeWorkspaceId'))
  }, [authReady, currentUserId, currentWorkspace?.id, refreshWorkspaceData])

  useEffect(() => {
    if (!authReady || !currentUserId || !expectedWorkspaceId || currentWorkspace?.id === expectedWorkspaceId) {
      setRetryCount(0)
      refreshingFor.current = null
      return
    }
    if (retryCount >= MAX_AUTOMATIC_RETRIES || refreshingFor.current === expectedWorkspaceId) return

    let cancelled = false
    const delayMs = retryCount === 0 ? 0 : 400 * 2 ** (retryCount - 1)
    const timer = window.setTimeout(() => {
      if (cancelled) return
      refreshingFor.current = expectedWorkspaceId
      void refreshWorkspaceData().finally(() => {
        if (refreshingFor.current === expectedWorkspaceId) refreshingFor.current = null
        if (!cancelled) setRetryCount((count) => count + 1)
      })
    }, delayMs)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [authReady, currentUserId, currentWorkspace?.id, expectedWorkspaceId, refreshWorkspaceData, retryCount])

  // Public/auth pages must never be blocked by a stale workspace id retained
  // in localStorage from an earlier signed-in session.
  if (authReady && !currentUserId) return children

  if (expectedWorkspaceId === undefined) {
    return <div className="min-h-screen bg-stone-50" aria-busy="true" />
  }

  if (expectedWorkspaceId && currentWorkspace?.id !== expectedWorkspaceId) {
    if (retryCount >= MAX_AUTOMATIC_RETRIES) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
          <div className="max-w-md text-center">
            <p className="text-sm font-medium text-gray-700">ワークスペースの切り替えを完了できませんでした。</p>
            <p className="mt-2 text-xs text-gray-500">通信状態を確認して、もう一度お試しください。</p>
            <button
              type="button"
              onClick={() => setRetryCount(0)}
              className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-stone-50"
            >
              再試行
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6" aria-busy="true">
        <p className="text-sm text-gray-500">ワークスペースを切り替えています…</p>
      </div>
    )
  }

  return children
}
