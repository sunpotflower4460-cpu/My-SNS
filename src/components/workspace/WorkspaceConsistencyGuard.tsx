'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/app/app-provider'

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
  const { currentWorkspace, refreshWorkspaceData } = useApp()
  const [expectedWorkspaceId, setExpectedWorkspaceId] = useState<string | null | undefined>(undefined)
  const refreshingFor = useRef<string | null>(null)

  // refreshWorkspaceData gets a new identity when AppProvider's active
  // workspace changes, so this also observes same-tab localStorage switches
  // (the browser `storage` event alone does not fire in the tab that wrote it).
  useEffect(() => {
    setExpectedWorkspaceId(localStorage.getItem('activeWorkspaceId'))
  }, [currentWorkspace?.id, refreshWorkspaceData])

  useEffect(() => {
    if (!expectedWorkspaceId || currentWorkspace?.id === expectedWorkspaceId) {
      refreshingFor.current = null
      return
    }
    if (refreshingFor.current === expectedWorkspaceId) return

    refreshingFor.current = expectedWorkspaceId
    void refreshWorkspaceData().finally(() => {
      if (refreshingFor.current === expectedWorkspaceId) refreshingFor.current = null
    })
  }, [currentWorkspace?.id, expectedWorkspaceId, refreshWorkspaceData])

  if (expectedWorkspaceId === undefined) {
    return <div className="min-h-screen bg-stone-50" aria-busy="true" />
  }

  if (expectedWorkspaceId && currentWorkspace?.id !== expectedWorkspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6" aria-busy="true">
        <p className="text-sm text-gray-500">ワークスペースを切り替えています…</p>
      </div>
    )
  }

  return children
}
