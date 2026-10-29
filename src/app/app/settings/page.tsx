'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import RoleBadge from '@/components/ui/RoleBadge'
import ConnectionRow from '@/components/settings/ConnectionRow'
import PlatformSetupGuide from '@/components/settings/PlatformSetupGuide'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import { getExtraConnectedAccounts, getPlatformConnection, listConnectedAccountsForPlatform } from '@/lib/presentation/settings-presenter'
import type { SocialAccount, SocialPlatform } from '@/lib/domain/types'
import { CONNECTABLE_PLATFORMS } from '@/lib/services/connectors/platforms'
import { PUBLISHING_CHANNEL_CONFIG, getPublishingStrategy } from '@/lib/channels/config'
import type { ConnectionSetupStatus } from '@/lib/services/connectors/platform-status'
import type { AiStatus } from '@/lib/services/llm-status'
import { detectAppUrlMismatch } from '@/lib/app-url'

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
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [error, setError] = useState('')
  const [platformFeedback, setPlatformFeedback] = useState('')
  const [platformError, setPlatformError] = useState('')
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null)
  const [exportError, setExportError] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  // null until loaded (or if the status call fails): rows then behave as before
  // and the connect route still refuses safely, so a failed call never hides Connect.
  const [setupStatus, setSetupStatus] = useState<ConnectionSetupStatus | null>(null)
  const workspaceId = currentWorkspace?.id
  const [aiStatus, setAiStatus] = useState<AiStatus | null | undefined>(undefined)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const publishingStrategy = getPublishingStrategy()
  const appUrlMismatch = detectAppUrlMismatch(process.env.NEXT_PUBLIC_APP_URL, typeof window === 'undefined' ? undefined : window.location.origin)
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || (typeof window === 'undefined' ? '' : window.location.origin)
  const canManageSocialAccounts = Boolean(currentMember && hasPermission(currentMember.role, 'manage_social_accounts'))

  useEffect(() => {
    setWorkspaceName(currentWorkspace?.name ?? '')
    setWorkspaceSlug(currentWorkspace?.slug ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace id/updatedAt only
  }, [currentWorkspace?.id, currentWorkspace?.updatedAt])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')
    if (connected) setPlatformFeedback(`${PUBLISHING_CHANNEL_CONFIG[connected as SocialPlatform]?.label ?? connected} に接続しました。`)
    if (oauthError) setPlatformError(oauthError)
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    fetch('/api/social/status', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<ConnectionSetupStatus>) : null))
      .then((status) => {
        if (!cancelled) setSetupStatus(status)
      })
      .catch(() => {
        if (!cancelled) setSetupStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    setAiTestResult(null)
    fetch(`/api/ai/status?workspaceId=${workspaceId}`, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<AiStatus>) : null))
      .then((status) => {
        if (!cancelled) setAiStatus(status)
      })
      .catch(() => {
        if (!cancelled) setAiStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const handleAiTest = async () => {
    if (!currentWorkspace) return
    setAiTesting(true)
    setAiTestResult(null)
    try {
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: currentWorkspace.id }),
      })
      const payload = await response.json().catch(() => ({}))
      setAiTestResult(
        response.ok
          ? { ok: true, message: `接続できました（${payload.model}・${payload.latencyMs}ms・入力${payload.inputTokens}/出力${payload.outputTokens}トークン）。` }
          : { ok: false, message: payload.error ?? 'AIに接続できませんでした。' },
      )
    } catch {
      setAiTestResult({ ok: false, message: '通信に失敗しました。ネットワークを確認してもう一度お試しください。' })
    } finally {
      setAiTesting(false)
    }
  }

  const lineConnection = getPlatformConnection('line', socialAccounts)
  const extraAccounts = getExtraConnectedAccounts(socialAccounts)

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
    setIsSavingWorkspace(true)
    try {
      await saveWorkspaceSettings(workspaceName, workspaceSlug)
      setSaved(true)
      setError('')
      window.setTimeout(() => setSaved(false), 2500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ワークスペース設定を保存できませんでした。')
      setSaved(false)
    } finally {
      setIsSavingWorkspace(false)
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
      // Some accounts synced, others did not: say so instead of a plain success.
      setPlatformError(
        result.failures.length > 0
          ? `一部のアカウントは同期できませんでした（${result.failures.length}件）。接続状態を確認してください。`
          : '',
      )
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
        <Card size="container" padded>
          <h2 className="mb-4 text-base font-semibold text-gray-900">サインイン中のユーザー</h2>
          <div className="flex flex-wrap items-center gap-4 rounded-card border border-stone-100 bg-stone-50 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
              {currentUser?.name.charAt(0) ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{currentUser?.name ?? 'ユーザーが選択されていません'}</p>
              <p className="truncate text-xs text-gray-500">{currentUser?.email ?? 'メールアドレス未設定'}</p>
            </div>
            <RoleBadge role={currentMember?.role ?? 'viewer'} />
          </div>
        </Card>

        <Card size="container" padded>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">ブランドプロフィール</h2>
              <p className="mt-1 text-sm text-gray-500">{defaultBrandProfile?.name ?? '未設定'} ・ 再利用できるトーン・表現のルール</p>
            </div>
            <Link
              href="/app/brand"
              className="inline-flex min-h-control items-center rounded-full border border-violet-200 px-4 text-sm font-medium text-violet-700 transition hover:bg-violet-50"
            >
              ブランドプロフィールを編集
            </Link>
          </div>
        </Card>

        <Card size="container" padded>
          <h2 className="mb-4 text-base font-semibold text-gray-900">ワークスペース</h2>
          {saved && <div className="mb-4"><InlineAlert tone="success">変更を保存しました。</InlineAlert></div>}
          {error && <div className="mb-4"><InlineAlert tone="error">{error}</InlineAlert></div>}
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
            <div className="mt-4">
              <Button variant="primary" onClick={() => void handleSaveWorkspace()} loading={isSavingWorkspace}>変更を保存</Button>
            </div>
          </PermissionGate>
        </Card>

        <Card size="container" padded id="ai">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">AI連携</h2>
            {aiStatus && (
              <Badge tone={aiStatus.configured ? 'success' : 'warning'}>
                {aiStatus.configured ? `接続設定済み・${aiStatus.provider === 'deepseek' ? 'DeepSeek' : 'Anthropic'}` : '未設定'}
              </Badge>
            )}
          </div>
          {aiStatus?.configured ? (
            <div className="mt-3 space-y-3 text-sm text-gray-600">
              <p>
                モデル: <code className="rounded bg-stone-100 px-1 text-xs">{aiStatus.model}</code>
                {' ・ '}
                月次AI予算: {aiStatus.monthlyBudgetUsd ? `$${aiStatus.monthlyBudgetUsd.toFixed(2)}` : '未設定（上限なし）'}
              </p>
              {aiStatus.monthlyBudgetUsd && !aiStatus.costRatesConfigured && (
                <InlineAlert tone="warning">
                  月次予算が設定されていますが、単価（<code className="rounded bg-white px-1 text-xs">AI_INPUT_COST_PER_MTOK</code> / <code className="rounded bg-white px-1 text-xs">AI_OUTPUT_COST_PER_MTOK</code>）が未設定のため、使用額が0のままで上限に達しません。
                </InlineAlert>
              )}
              <PermissionGate requiredPermission="edit_settings" currentRole={currentMember?.role ?? 'viewer'}>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => void handleAiTest()} loading={aiTesting}>接続テスト</Button>
                  <span className="text-xs text-gray-500">ごく短い実呼び出しを1回行います（費用はごくわずかです）。</span>
                </div>
              </PermissionGate>
              {aiTestResult && <InlineAlert tone={aiTestResult.ok ? 'success' : 'error'}>{aiTestResult.message}</InlineAlert>}
            </div>
          ) : aiStatus ? (
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>APIキーが未設定のため、いまは「AI提案」ではなく固定テンプレートの下書きが表示されます。</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="text-violet-700 hover:text-violet-900">DeepSeek Platform</a> でAPIキーを発行します（残高のチャージが必要な場合があります）。</li>
                <li><code className="rounded bg-stone-100 px-1 text-xs">.env.local</code> の <code className="rounded bg-stone-100 px-1 text-xs">DEEPSEEK_API_KEY</code> に貼り付けます。</li>
                <li>開発サーバーを再起動し、この画面で「接続テスト」を押します。</li>
              </ol>
            </div>
          ) : aiStatus === undefined ? (
            <p className="mt-3 text-sm text-gray-500">読み込み中…</p>
          ) : (
            <p className="mt-3 text-sm text-gray-500">AIの状態を表示できませんでした（設定を見る権限がないか、通信に失敗しました）。</p>
          )}
        </Card>

        <Card size="container" padded id="connections">
          <h2 className="mb-1 text-base font-semibold text-gray-900">連携済みの媒体</h2>
          <div className="mb-4">
            {publishingStrategy === 'zero-cost' ? (
              <InlineAlert tone="info">
                現在は<strong>手動投稿モード</strong>です。アカウントを接続しなくても、承認した内容をコピー・共有して各SNSの画面から投稿できます（最後の公開ボタンはご自身で押します）。ここでの接続は、自動投稿に切り替える場合と、受信箱の取り込みで使います。
              </InlineAlert>
            ) : (
              <InlineAlert tone="info">
                現在は<strong>自動投稿モード</strong>です。接続した媒体には、予約時刻に自動で投稿されます。
              </InlineAlert>
            )}
          </div>
          {canManageSocialAccounts && appUrlMismatch && (
            <div className="mb-4">
              <InlineAlert tone="warning">
                アプリのURL設定（<code className="rounded bg-white px-1 text-xs">NEXT_PUBLIC_APP_URL</code> = {appUrlMismatch.configured}）が、いま開いているURL（{appUrlMismatch.current}）と違います。SNS接続のRedirect URIは設定側のURLで作られるため、このままだと接続に失敗します。本番では実際のURLに直して再デプロイしてください。
              </InlineAlert>
            </div>
          )}
          {canManageSocialAccounts && setupStatus && !setupStatus.tokenEncryptionReady && (
            <div className="mb-4">
              <InlineAlert tone="warning">
                トークン暗号化キー <code className="rounded bg-white px-1 text-xs">SOCIAL_TOKEN_ENCRYPTION_KEY</code> が未設定か不正です。設定するまで、どの媒体も接続できません（ターミナルで <code className="rounded bg-white px-1 text-xs">node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;</code> を実行して得た値を設定します）。
              </InlineAlert>
            </div>
          )}
          {platformFeedback && <div className="mb-4"><InlineAlert tone="success">{platformFeedback}</InlineAlert></div>}
          {platformError && <div className="mb-4"><InlineAlert tone="error">{platformError}</InlineAlert></div>}
          <div className="space-y-3">
            {CONNECTABLE_PLATFORMS.map((platform) => {
              const connectedAccounts = listConnectedAccountsForPlatform(platform, socialAccounts)
              const connectHref = currentWorkspace ? `/api/social/${platform}/connect?workspaceId=${currentWorkspace.id}` : undefined
              const platformSetup = setupStatus?.platforms[platform]
              // Server-config guidance is only for members who can act on it.
              const setupRequired = canManageSocialAccounts && platformSetup ? !platformSetup.configured : false
              if (connectedAccounts.length === 0) {
                return (
                  <div key={platform} className="space-y-2">
                    <ConnectionRow
                      icon={PLATFORM_ICONS[platform]}
                      label={PUBLISHING_CHANNEL_CONFIG[platform].label}
                      handle="未接続"
                      connected={false}
                      busy={busyPlatform === platform}
                      canManage={canManageSocialAccounts}
                      connectHref={setupRequired ? undefined : connectHref}
                      setupRequired={setupRequired}
                      onSync={() => void handleSync(platform)}
                    />
                    {setupRequired && platformSetup && (
                      <PlatformSetupGuide platform={platform} missingEnv={platformSetup.missingEnv} baseUrl={appBaseUrl} />
                    )}
                  </div>
                )
              }
              return connectedAccounts.map((account, index) => (
                <ConnectionRow
                  key={account.id}
                  icon={PLATFORM_ICONS[platform]}
                  label={PUBLISHING_CHANNEL_CONFIG[platform].label}
                  handle={account.handle}
                  connected
                  busy={busyPlatform === platform}
                  canManage={canManageSocialAccounts}
                  connectHref={index === 0 ? connectHref : undefined}
                  onSync={index === 0 ? () => void handleSync(platform) : undefined}
                  onDisconnect={() => void handleDisconnect(account)}
                />
              ))
            })}
            {extraAccounts.map((account) => (
              <ConnectionRow
                key={account.id}
                icon={PLATFORM_ICONS[account.platform]}
                label={PUBLISHING_CHANNEL_CONFIG[account.platform].label}
                handle={account.handle}
                connected
              />
            ))}
          </div>
        </Card>

        <Card size="container" padded>
          <h2 className="mb-1 text-base font-semibold text-gray-900">メッセージ（LINE・DM）</h2>
          <p className="mb-4 text-sm text-gray-500">LINE公式アカウントを接続すると、届いたメッセージを受信箱で一元管理し、AIの要約・返信提案・承認後の送信ができます。</p>
          <div className="space-y-3">
            <ConnectionRow
              icon={PLATFORM_ICONS.line}
              label="LINE公式アカウント"
              handle={lineConnection.handle}
              connected={lineConnection.connected}
              busy={busyPlatform === 'line'}
              canManage={canManageSocialAccounts}
              onConnect={() => void handleConnectLine()}
              onDisconnect={lineConnection.account ? () => void handleDisconnect(lineConnection.account as SocialAccount) : undefined}
            />
            <p className="text-xs text-gray-400">
              Instagram DMは受信のみ対応です（送信は今後のアップデートで対応予定 — Metaのメッセージ権限と審査が前提のためです）。
            </p>
          </div>
        </Card>

        <Card size="container" padded>
          <h2 className="mb-2 text-base font-semibold text-gray-900">データのエクスポート</h2>
          <p className="mb-4 text-sm text-gray-500">このワークスペースのシード、ブランドプロフィール、承認済みのRevision、投稿履歴をJSON形式のスナップショットとしてダウンロードできます。本アプリに依存せず、いつでも取り出せるご自身のコンテンツ資産として保管いただけます。</p>
          {exportError && <div className="mb-4"><InlineAlert tone="error">{exportError}</InlineAlert></div>}
          <PermissionGate requiredPermission="edit_settings" currentRole={currentMember?.role ?? 'viewer'}>
            <Button variant="primary" onClick={() => void handleExport()} loading={isExporting}>
              ワークスペースデータをエクスポート
            </Button>
          </PermissionGate>
        </Card>

        <Card size="container" padded>
          <h2 className="mb-1 text-base font-semibold text-gray-900">外部カレンダー連携（Notion / TimeTree）</h2>
          <p className="mb-4 text-sm text-gray-500">
            アプリ内カレンダーの予定を、Notion または TimeTree に「同期」ボタンで書き出せます。接続はサーバー側の環境変数（Notionは連携トークン＋データベースID、TimeTreeはアクセストークン＋カレンダーID）で設定します。
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-gray-400">•</span>
              <span><strong>Notion</strong>: <a href="https://www.notion.so/my-integrations" className="text-violet-700 hover:text-violet-900" target="_blank" rel="noreferrer">連携を作成</a>し、対象データベース（タイトル「Name」・日付「Date」プロパティ）に共有して、<code className="rounded bg-stone-100 px-1 text-xs">NOTION_INTEGRATION_TOKEN</code> と <code className="rounded bg-stone-100 px-1 text-xs">NOTION_CALENDAR_DATABASE_ID</code> を設定します。</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-gray-400">•</span>
              <span><strong>TimeTree</strong>: <a href="https://developers.timetree.app/" className="text-violet-700 hover:text-violet-900" target="_blank" rel="noreferrer">アプリを登録</a>し、<code className="rounded bg-stone-100 px-1 text-xs">TIMETREE_ACCESS_TOKEN</code> と <code className="rounded bg-stone-100 px-1 text-xs">TIMETREE_CALENDAR_ID</code> を設定します。</span>
            </li>
          </ul>
          <p className="mt-4 rounded-card border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-gray-500">
            トークン発行・共有設定はご本人の操作が必要です。未設定の間は「同期」を押しても偽の成功は返さず、「未設定」と正直にお伝えして安全に停止します。
          </p>
        </Card>

        <Card size="container" padded>
          <h2 className="mb-2 text-base font-semibold text-gray-900">現在の対応範囲</h2>
          <p className="text-sm leading-6 text-gray-500">
            設定・メンバーシップ・シード・ブランドプロフィール・キューの更新・受信箱でのやり取り・非公開アセットのメタデータは、いずれもSupabaseに保存されます。X・Instagram・YouTube・TikTokはOAuthで接続でき、いずれも実際に投稿を実行できます。noteは公式APIがないため、手動でコピーして確認する引き渡し方式にとどめています。Instagramのコメント・DMはWebhook経由で受信箱に自動的に取り込まれます。それ以外の媒体は「受信箱を同期」ボタンでの取得となり（YouTubeは実際のコメントを取得できますが、XとTikTokは各プラットフォームがより広いAPIアクセスを許可するまで対応できていません。これは隠さずお伝えする、正直な未対応部分です）。メッセージのAIコンシェルジュ（要約・返信提案・承認後の送信）は、送信までフル対応しているのはLINE公式アカウントのみです。承認した返信は相手の生活時間に合わせた時刻に予約され（深夜は避け、「今すぐ送信」も選べます）、送信WorkerはHobbyプラン制約で1日1回のため、予約時刻の次の実行まで待つことがあります。LINE未接続やAI未設定の場合は偽の成功を返さず安全に停止します。Instagram DMは受信・要約・返信案の作成までで、送信はMetaの審査が前提のため未対応です。
          </p>
        </Card>
      </div>
    </div>
  )
}
