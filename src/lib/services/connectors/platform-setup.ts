// Client-safe: static, human-readable setup guidance for each OAuth platform.
// Nothing here reads process.env or holds a secret — only the *names* of the
// env vars an operator must set and where to register the app. The server-side
// status (which of these are actually set) lives in platform-status.ts.

import type { ConnectablePlatform } from './platforms'

export interface PlatformSetupGuide {
  platform: ConnectablePlatform
  /** Where the creator registers the developer app. */
  consoleUrl: string
  consoleLabel: string
  /** Env vars that must ALL be set before Connect can work end to end. */
  envVars: string[]
  /** Ordered, plain-language steps. */
  steps: string[]
  /** An honest limitation the creator should know before investing time. */
  caveat?: string
}

export const PLATFORM_SETUP_GUIDES: Record<ConnectablePlatform, PlatformSetupGuide> = {
  x: {
    platform: 'x',
    consoleUrl: 'https://developer.x.com/en/portal/dashboard',
    consoleLabel: 'X Developer Portal',
    envVars: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    steps: [
      'X Developer Portal でアプリを作成し、User authentication settings で OAuth 2.0 を有効にします。',
      'App permissions は「Read and write」、Type of App は「Web App」を選びます。',
      '下の Redirect URI を Callback URI としてそのまま登録します。',
      '発行された Client ID / Client Secret を .env.local に設定します。',
    ],
    caveat: 'Xの無料枠は投稿のみです。コメントやメンションの取得には有料APIが必要です。',
  },
  instagram: {
    platform: 'instagram',
    consoleUrl: 'https://developers.facebook.com/apps/',
    consoleLabel: 'Meta for Developers',
    envVars: ['META_APP_ID', 'META_APP_SECRET'],
    steps: [
      'Instagram を「ビジネス」または「クリエイター」アカウントに切り替え、Facebookページと連携します。',
      'Meta for Developers でアプリを作成し、Facebook Login と Instagram の製品を追加します。',
      '下の Redirect URI を「有効なOAuthリダイレクトURI」に登録します。',
      'アプリID / アプリシークレットを .env.local に設定します。',
    ],
    caveat: '開発モードのアプリは、アプリに登録したテスターのアカウントだけ接続・投稿できます。他人のアカウントはMetaのアプリレビューが必要です。',
  },
  youtube: {
    platform: 'youtube',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    consoleLabel: 'Google Cloud Console',
    envVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    steps: [
      'Google Cloud でプロジェクトを作成し、YouTube Data API v3 を有効にします。',
      'OAuth 同意画面を設定し、自分のGoogleアカウントをテストユーザーに追加します。',
      '「OAuth クライアント ID（ウェブ アプリケーション）」を作成し、下の Redirect URI を承認済みリダイレクトURIに登録します。',
      'クライアントID / シークレットを .env.local に設定します。',
    ],
    caveat: 'テスト公開のままだと、接続の有効期限が短くなることがあります。切れたら再接続してください。',
  },
  tiktok: {
    platform: 'tiktok',
    consoleUrl: 'https://developers.tiktok.com/apps/',
    consoleLabel: 'TikTok for Developers',
    envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    steps: [
      'TikTok for Developers でアプリを作成し、Login Kit と Content Posting API を追加します。',
      '下の Redirect URI を Login Kit の Redirect URI に登録します。',
      'Client Key / Client Secret を .env.local に設定します。',
    ],
    caveat: '審査前のアプリは「自分だけ（SELF_ONLY）」の非公開投稿になります。公開投稿にはTikTokの監査が必要です。',
  },
}

/** The exact redirect URI to register in the platform's developer console. */
export function buildPlatformRedirectUri(baseUrl: string, platform: ConnectablePlatform): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/social/${platform}/callback`
}
