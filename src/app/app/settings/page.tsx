'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import RoleBadge from '@/components/ui/RoleBadge'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'
import { CONNECTABLE_PLATFORMS, isConnectablePlatform } from '@/lib/services/connectors/platforms'

const PLATFORM_ICONS: Record<SocialPlatform, string> = {
  youtube: '▶',
  instagram: '📷',
  threads: '🧵',
  x: '𝕏',
  tiktok: '♪',
  facebook: '𝑓',
}

export default function SettingsPage() {
  const { currentMember, currentWorkspace, defaultBrandProfile, disconnectSocialAccount, saveWorkspaceSettings, socialAccounts } = useApp()
  const { currentUser } = useCurrentUser()
  const searchParams = useSearchParams()
  const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name ?? '')
  const [workspaceSlug, setWorkspaceSlug] = useState(currentWorkspace?.slug ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [platformFeedback, setPlatformFeedback] = useState('')
  const [platformError, setPlatformError] = useState('')
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null)
  const canManageSocialAccounts = Boolean(currentMember && hasPermission(currentMember.role, 'manage_social_accounts'))

  useEffect(() => {
    setWorkspaceName(currentWorkspace?.name ?? '')
    setWorkspaceSlug(currentWorkspace?.slug ?? '')
  }, [currentWorkspace])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')
    if (connected) setPlatformFeedback(`Connected ${connected}.`)
    if (oauthError) setPlatformError(oauthError)
  }, [searchParams])

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

  const handleDisconnect = async (account: SocialAccount) => {
    setBusyPlatform(account.platform)
    try {
      await disconnectSocialAccount(account.id)
      setPlatformFeedback(`Disconnected ${account.platform}.`)
      setPlatformError('')
    } catch (cause) {
      setPlatformError(cause instanceof Error ? cause.message : 'Unable to disconnect this account.')
      setPlatformFeedback('')
    } finally {
      setBusyPlatform(null)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage workspace identity and review connected channels in the active workspace." />

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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Brand Profile</h2>
              <p className="mt-1 text-sm text-gray-500">{defaultBrandProfile?.name ?? 'Not configured'} · reusable voice and wording boundaries</p>
            </div>
            <Link href="/app/brand" className="rounded-2xl border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50">Edit Brand Profile</Link>
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
          {platformFeedback && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{platformFeedback}</div>}
          {platformError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{platformError}</div>}
          <div className="space-y-3">
            {CONNECTABLE_PLATFORMS.map((platform) => {
              const account = socialAccounts.find((entry) => entry.platform === platform && entry.connected)
              return (
                <div key={platform} className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-gray-600">{PLATFORM_ICONS[platform]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize text-gray-900">{platform}</p>
                    <p className="truncate text-xs text-gray-500">{account?.handle ?? 'Not connected'}</p>
                  </div>
                  {account ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-600">Connected</span>
                      {canManageSocialAccounts && (
                        <button
                          onClick={() => void handleDisconnect(account)}
                          disabled={busyPlatform === platform}
                          className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-white hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  ) : canManageSocialAccounts && currentWorkspace ? (
                    <a
                      href={`/api/social/${platform}/connect?workspaceId=${currentWorkspace.id}`}
                      className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
                    >
                      Connect
                    </a>
                  ) : (
                    <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-gray-400">Disconnected</span>
                  )}
                </div>
              )
            })}
            {socialAccounts
              .filter((account) => account.connected && !isConnectablePlatform(account.platform))
              .map((account) => (
                <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-gray-600">{PLATFORM_ICONS[account.platform]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize text-gray-900">{account.platform}</p>
                    <p className="truncate text-xs text-gray-500">{account.handle}</p>
                  </div>
                  <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-600">Connected</span>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-2 text-base font-semibold text-gray-900">Current scope</h2>
          <p className="text-sm leading-6 text-gray-500">
            Settings, memberships, Seeds, Brand Profile, queue updates, inbox interactions, and private asset metadata are stored in Supabase. X and Instagram can be connected via OAuth; YouTube, TikTok, and note remain disabled until their reviewed implementation phases.
          </p>
        </div>
      </div>
    </div>
  )
}
