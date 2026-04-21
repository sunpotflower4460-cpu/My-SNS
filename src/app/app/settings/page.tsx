'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import RoleBadge from '@/components/ui/RoleBadge'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMockApp } from '@/lib/app/app-provider'
import type { SocialPlatform } from '@/lib/domain/types'

const PLATFORM_ICONS: Record<SocialPlatform, string> = {
  youtube: '▶',
  instagram: '📷',
  threads: '🧵',
  x: '𝕏',
  tiktok: '♪',
  facebook: '𝑓',
}

export default function SettingsPage() {
  const { currentMember, currentWorkspace, saveWorkspaceSettings, socialAccounts } = useMockApp()
  const { currentUser } = useCurrentUser()
  const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name ?? '')
  const [workspaceSlug, setWorkspaceSlug] = useState(currentWorkspace?.slug ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setWorkspaceName(currentWorkspace?.name ?? '')
    setWorkspaceSlug(currentWorkspace?.slug ?? '')
  }, [currentWorkspace])

  const handleSaveWorkspace = async () => {
    try {
      await saveWorkspaceSettings(workspaceName, workspaceSlug)
      setSaved(true)
      setError('')
      window.setTimeout(() => setSaved(false), 2500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save workspace settings.')
      setSaved(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage workspace identity and review connected channels in the active mock workspace." />

      <div className="max-w-4xl space-y-6">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Signed-in user</h2>
          <div className="flex flex-wrap items-center gap-4 rounded-[1.5rem] border border-stone-100 bg-stone-50 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
              {currentUser?.name.charAt(0) ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{currentUser?.name ?? 'No user selected'}</p>
              <p className="truncate text-xs text-gray-500">{currentUser?.email ?? 'Missing email'}</p>
            </div>
            <RoleBadge role={currentMember?.role ?? 'viewer'} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Workspace</h2>
          {saved && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Changes saved.</div>}
          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Name</label>
              <input type="text" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Slug</label>
              <input type="text" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
          <PermissionGate requiredPermission="edit_settings" currentRole={currentMember?.role ?? 'viewer'}>
            <button onClick={handleSaveWorkspace} className="mt-4 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700">Save Changes</button>
          </PermissionGate>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Connected Platforms</h2>
          <div className="space-y-3">
            {socialAccounts.map((account) => (
              <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-gray-600">{PLATFORM_ICONS[account.platform]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize text-gray-900">{account.platform}</p>
                  <p className="truncate text-xs text-gray-500">{account.handle}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${account.connected ? 'border-green-200 bg-green-50 text-green-600' : 'border-stone-200 bg-white text-gray-400'}`}>
                  {account.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-2 text-base font-semibold text-gray-900">Current scope</h2>
          <p className="text-sm leading-6 text-gray-500">
            This prototype keeps settings, memberships, content, queue updates, and inbox interactions in local mock persistence. Branding uploads, OAuth, and destructive workspace actions stay deferred to Phase 2.
          </p>
        </div>
      </div>
    </div>
  )
}
