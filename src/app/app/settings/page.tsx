'use client'

import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import { MOCK_SOCIAL_ACCOUNTS, CURRENT_WORKSPACE, CURRENT_MEMBER } from '@/lib/mock/seed'
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
  const [workspaceName, setWorkspaceName] = useState(CURRENT_WORKSPACE.name)
  const [workspaceSlug, setWorkspaceSlug] = useState(CURRENT_WORKSPACE.slug)
  const [saved, setSaved] = useState(false)

  const handleSaveWorkspace = () => {
    console.log('[Settings] Save workspace:', { workspaceName, workspaceSlug })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your workspace settings and integrations."
      />

      <div className="max-w-2xl space-y-6">
        {/* Workspace Info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Workspace</h2>
          {saved && (
            <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
              ✓ Changes saved!
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <PermissionGate requiredPermission="edit_settings" currentRole={CURRENT_MEMBER.role}>
              <button
                onClick={handleSaveWorkspace}
                className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"
              >
                Save Changes
              </button>
            </PermissionGate>
          </div>
        </div>

        {/* Branding */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Branding</h2>
          <p className="text-sm text-gray-400">Logo upload and brand colors — coming in Phase 2.</p>
        </div>

        {/* Connected Platforms */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Connected Platforms</h2>
          <div className="space-y-3">
            {MOCK_SOCIAL_ACCOUNTS.map((account) => (
              <div key={account.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 text-sm font-bold shrink-0">
                  {PLATFORM_ICONS[account.platform]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 capitalize">{account.platform}</p>
                  <p className="text-xs text-gray-500">{account.handle}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    account.connected
                      ? 'bg-green-50 text-green-600 border-green-200'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}
                >
                  {account.connected ? 'Connected' : 'Disconnected'}
                </span>
                <PermissionGate requiredPermission="manage_social_accounts" currentRole={CURRENT_MEMBER.role}>
                  <button className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50">
                    {account.connected ? 'Disconnect' : 'Connect'}
                  </button>
                </PermissionGate>
              </div>
            ))}
          </div>
        </div>

        {/* AI Settings */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">AI Settings</h2>
          <p className="text-sm text-gray-400">AI model selection and prompt customization — coming in Phase 2.</p>
          <div className="mt-3 space-y-2 opacity-50 pointer-events-none">
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input type="checkbox" className="rounded" defaultChecked /> Enable AI draft generation
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input type="checkbox" className="rounded" defaultChecked /> Enable AI reply suggestions
            </label>
          </div>
        </div>

        {/* Danger Zone */}
        <PermissionGate requiredPermission="delete_workspace" currentRole={CURRENT_MEMBER.role}>
          <div className="bg-white border border-red-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-red-600 mb-4">Danger Zone</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Transfer Ownership</p>
                  <p className="text-xs text-gray-500">Transfer this workspace to another member.</p>
                </div>
                <button className="text-sm border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  Transfer
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600">Delete Workspace</p>
                  <p className="text-xs text-gray-500">Permanently delete this workspace and all data.</p>
                </div>
                <button className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </PermissionGate>

        <p className="text-xs text-gray-400 pb-4">
          Phase 2 will wire up real persistence, OAuth platform connections, and Supabase RLS.
        </p>
      </div>
    </div>
  )
}
