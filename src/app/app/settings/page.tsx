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
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'

const PLATFORM_ICONS: Record<SocialPlatform, string> = {
  youtube: '▶',
  instagram: '📷',
  threads: '🧵',
  x: '𝕏',
  tiktok: '♪',
  facebook: '𝑓',
  line: '💬',
}

export default function SettingsPage() {
  const { connectLineAccount, currentMember, currentWorkspace, defaultBrandProfile, disconnectSocialAccount, exportWorkspaceData, saveWorkspaceSettings, socialAccounts, syncInboxFromPlatform } = useApp()
  const { currentUser } = useCurrentUser()
  const searchParams = useSearchParams()
  const [workspaceName, setWorkspaceName] = useState(currentWorkspace?.name ?? '')
  const [workspaceSlug, setWorkspaceSlug] = useState(currentWorkspace?.slug ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [platformFeedback, setPlatformFeedback] = useState('')
  const [platformError, setPlatformError] = useState('')
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null)
  const [exportError, setExportError] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const canManageSocialAccounts = Boolean(currentMember && hasPermission(currentMember.role, 'manage_social_accounts'))

  useEffect(() => {
    setWorkspaceName(currentWorkspace?.name ?? '')
    setWorkspaceSlug(currentWorkspace?.slug ?? '')
  }, [currentWorkspace])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')
    if (connected) setPlatformFeedback(`${PUBLISHING_CHANNEL_CONFIG[connected as SocialPlatform]?.label ?? connected} に接続しました。`)
    if (oauthError) setPlatformError(oauthError)
  }, [searchParams])

  const lineAccount = socialAccounts.find((account) => account.platform === 'line' && account.connected)

  const handleConnectLine = async () => {
    setBusyPlatform('line')
    try {
      await connectLineAccount()
      setPlatformFeedback('LINE公式アカウントを接続しました。')
      setPlatformError('')
    } catch (cause) {
      setPlatformError(cause instanceof Error ? cause.message : 'LINEの接続に失敗しました。')
      setPlatformFeedback('')
    } finally {
      setBusyPlatform(null)
    }
  }

  const handleSaveWorkspace = async () => {
    try {
      await saveWorkspaceSettings(workspaceName, workspaceSlug)
      setSaved(true)
      setError('')
      window.setTimeout(() => setSaved(false), 2500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ワークスペース設定を保存できませんでした。')
      setSaved(false)
    }
  }

  const handleDisconnect = async (account: SocialAccount) => {
    setBusyPlatform(account.platform)
    try {
      await disconnectSocialAccount(account.id)
      setPlatformFeedback(`${PUBLISHING_CHANNEL_CONFIG[account.platform].label} の接続を解除しました。`)
      setPlatformError('')
    } catch (cause) {
      setPlatformError(cause instanceof Error ? cause.message : 'このアカウントの接続を解除できませんでした。')
      setPlatformFeedback('')
    } finally {
      setBusyPlatform(null)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportWorkspaceData()
      setExportError('')
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'ワークスペースデータをエクスポートできませんでした。')
    } finally {
      setIsExporting(false)
    }
  }

  const handleSync = async (platform: SocialPlatform) => {
    setBusyPlatform(platform)
    try {
      const result = await syncInboxFromPlatform(platform)
      setPlatformFeedback(`${PUBLISHING_CHANNEL_CONFIG[platform].label} を同期しました。新着 ${result.ingested} 件。`)
      setPlatformError('')
    } catch (cause) {
      setPlatformError(cause instanceof Error ? cause.message : 'この媒体を同期できませんでした。')
      setPlatformFeedback('')
    } finally {
      setBusyPlatform(null)
    }
  }

  return (
    <div>
      <PageHeader title="設定" description="ワークスペースの基本情報を管理し、現在のワークスペースで連携済みの媒体を確認します。" />

      <div className="max-w-4xl space-y-6">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">サインイン中のユーザー</h2>
          <div className="flex flex-wrap items-center gap-4 rounded-[1.5rem] border border-stone-100 bg-stone-50 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
              {currentUser?.name.charAt(0) ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{currentUser?.name ?? 'ユーザーが選択されていません'}</p>
              <p className="truncate text-xs text-gray-500">{currentUser?.email ?? 'メールアドレス未設定'}</p>
            </div>
            <RoleBadge role={currentMember?.role ?? 'viewer'} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">ブランドプロフィール</h2>
              <p className="mt-1 text-sm text-gray-500">{defaultBrandProfile?.name ?? '未設定'} ・ 再利用できるトーン・表現のルール</p>
            </div>
            <Link href="/app/brand" className="rounded-2xl border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50">ブランドプロフィールを編集</Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">ワークスペース</h2>
          {saved && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">変更を保存しました。</div>}
          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">名前</label>
              <input type="text" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">スラッグ</label>
              <input type="text" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
          <PermissionGate requiredPermission="edit_settings" currentRole={currentMember?.role ?? 'viewer'}>
            <button onClick={handleSaveWorkspace} className="mt-4 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700">変更を保存</button>
          </PermissionGate>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">連携済みの媒体</h2>
          {platformFeedback && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{platformFeedback}</div>}
          {platformError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{platformError}</div>}
          <div className="space-y-3">
            {CONNECTABLE_PLATFORMS.map((platform) => {
              const account = socialAccounts.find((entry) => entry.platform === platform && entry.connected)
              return (
                <div key={platform} className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-gray-600">{PLATFORM_ICONS[platform]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{PUBLISHING_CHANNEL_CONFIG[platform].label}</p>
                    <p className="truncate text-xs text-gray-500">{account?.handle ?? '未接続'}</p>
                  </div>
                  {account ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-600">接続済み</span>
                      {canManageSocialAccounts && (
                        <button
                          onClick={() => void handleSync(account.platform)}
                          disabled={busyPlatform === platform}
                          className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
                        >
                          受信箱を同期
                        </button>
                      )}
                      {canManageSocialAccounts && (
                        <button
                          onClick={() => void handleDisconnect(account)}
                          disabled={busyPlatform === platform}
                          className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-white hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                        >
                          接続を解除
                        </button>
                      )}
                    </div>
                  ) : canManageSocialAccounts && currentWorkspace ? (
                    <a
                      href={`/api/social/${platform}/connect?workspaceId=${currentWorkspace.id}`}
                      className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
                    >
                      接続する
                    </a>
                  ) : (
                    <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-gray-400">未接続</span>
                  )}
                </div>
              )
            })}
            {socialAccounts
              .filter((account) => account.connected && !isConnectablePlatform(account.platform) && account.platform !== 'line')
              .map((account) => (
                <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-gray-600">{PLATFORM_ICONS[account.platform]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{PUBLISHING_CHANNEL_CONFIG[account.platform].label}</p>
                    <p className="truncate text-xs text-gray-500">{account.handle}</p>
                  </div>
                  <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-600">接続済み</span>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-1 text-base font-semibold text-gray-900">メッセージ（LINE・DM）</h2>
          <p className="mb-4 text-sm text-gray-500">LINE公式アカウントを接続すると、届いたメッセージを受信箱で一元管理し、AIの要約・返信提案・承認後の送信ができます。</p>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold text-gray-600">{PLATFORM_ICONS.line}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">LINE公式アカウント</p>
                <p className="truncate text-xs text-gray-500">{lineAccount?.handle ?? '未接続'}</p>
              </div>
              {lineAccount ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-600">接続済み</span>
                  {canManageSocialAccounts && (
                    <button
                      onClick={() => void handleDisconnect(lineAccount)}
                      disabled={busyPlatform === 'line'}
                      className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-white hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                    >
                      接続を解除
                    </button>
                  )}
                </div>
              ) : canManageSocialAccounts ? (
                <button
                  onClick={() => void handleConnectLine()}
                  disabled={busyPlatform === 'line'}
                  className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-50"
                >
                  {busyPlatform === 'line' ? '接続中…' : '接続する'}
                </button>
              ) : (
                <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-gray-400">未接続</span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Instagram DMは受信のみ対応です（送信は今後のアップデートで対応予定 — Metaのメッセージ権限と審査が前提のためです）。
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-2 text-base font-semibold text-gray-900">データのエクスポート</h2>
          <p className="mb-4 text-sm text-gray-500">このワークスペースのシード、ブランドプロフィール、承認済みのRevision、投稿履歴をJSON形式のスナップショットとしてダウンロードできます。本アプリに依存せず、いつでも取り出せるご自身のコンテンツ資産として保管いただけます。</p>
          {exportError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{exportError}</div>}
          <PermissionGate requiredPermission="edit_settings" currentRole={currentMember?.role ?? 'viewer'}>
            <button
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-50"
            >
              {isExporting ? '準備中…' : 'ワークスペースデータをエクスポート'}
            </button>
          </PermissionGate>
        </div>

        <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-2 text-base font-semibold text-gray-900">現在の対応範囲</h2>
          <p className="text-sm leading-6 text-gray-500">
            設定・メンバーシップ・シード・ブランドプロフィール・キューの更新・受信箱でのやり取り・非公開アセットのメタデータは、いずれもSupabaseに保存されます。X・Instagram・YouTube・TikTokはOAuthで接続でき、いずれも実際に投稿を実行できます。noteは公式APIがないため、手動でコピーして確認する引き渡し方式にとどめています。Instagramのコメント・DMはWebhook経由で受信箱に自動的に取り込まれます。それ以外の媒体は「受信箱を同期」ボタンでの取得となり（YouTubeは実際のコメントを取得できますが、XとTikTokは各プラットフォームがより広いAPIアクセスを許可するまで対応できていません。これは隠さずお伝えする、正直な未対応部分です）。
          </p>
        </div>
      </div>
    </div>
  )
}
