'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import { useMockApp } from '@/lib/mock/store/provider'
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
  const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name ?? '')
  const [workspaceSlug, setWorkspaceSlug] = useState(currentWorkspace?.slug ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setWorkspaceName(currentWorkspace?.name ?? '')
    setWorkspaceSlug(currentWorkspace?.slug ?? '')
  }, [currentWorkspace])

  const handleSaveWorkspace = () => {
    saveWorkspaceSettings(workspaceName, workspaceSlug)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage workspace identity and review connected channels in the active mock workspace." />

      <div className="max-w-4xl space-y-6">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Workspace</h2>
          {saved && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Changes saved.</div>}
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
