# iOS architecture audit（PRE-0）

調査日: 2026-09-02  
対象: `sunpotflower4460-cpu/My-SNS`（Next.js 15.5 App Router / React 19 / Supabase / Vercel）  
範囲: 読み取りのみ。Capacitor 導入・スキーマ変更・OAuth 変更はしていない。

本ファイルは証拠メモである。方針と工程は `docs/ios-app-store-plan.md` を正とする。

---

## 1. Auth

| 項目 | 現状 | ファイル |
|---|---|---|
| ログイン | マジックリンク（`signInWithOtp`）。パスワードなし | `src/app/login/page.tsx` |
| Redirect | `emailRedirectTo: ${window.location.origin}/app/dashboard` | 同 76 行 |
| 着地 callback ルート | **なし**。`detectSessionInUrl` + PKCE が URL の `code` を処理 | `@supabase/ssr` の browser client |
| セッション | Cookie（`sb-<ref>-auth-token`）。`SameSite=Lax`、`httpOnly: false` | `src/lib/supabase/client.ts` / middleware |
| Refresh | middleware が毎リクエスト `getUser()` | `src/lib/supabase/middleware.ts` 30–31 行 |
| `/app` 保護 | クライアント側 `router.replace('/login')` のみ。middleware は認証ゲートではない | `src/app/app/layout.tsx` 15–18 行 |
| OTP クールダウン | `sessionStorage`（セッション本体ではない） | `src/lib/auth/login-otp.ts` |
| サインアウト | あり | `src/lib/auth/auth-provider.tsx` |
| アカウント削除 | **なし** | リポジトリ検索 0 件 |

iOS 含意: メールのマジックリンクは Safari で開く。WKWebView とは Cookie ジャーが別なので、Universal Links かアプリ内 OTP 入力がないと「アプリ内はログアウトのまま」になる。

---

## 2. SNS OAuth

| 媒体 | Connect | Callback | 備考 |
|---|---|---|---|
| X / Instagram / YouTube / TikTok | `GET /api/social/[platform]/connect` | `GET /api/social/[platform]/callback` | フルページ 302 |
| LINE | `POST /api/social/line/connect` | なし | サーバー env のチャネルトークン。OAuth ではない |

Redirect URI は `NEXT_PUBLIC_APP_URL` または `request.nextUrl.origin`（`src/app/api/social/[platform]/connect/route.ts` 9–12 行）。`window.location.origin` は使わない。

Secret はすべてサーバー env（`X_CLIENT_SECRET` / `META_APP_SECRET` / `YOUTUBE_CLIENT_SECRET` / `TIKTOK_CLIENT_SECRET` / `LINE_CHANNEL_*`）。トークンは `SOCIAL_TOKEN_ENCRYPTION_KEY` で AES-256-GCM 暗号化後 `social_account_credentials` へ。RLS ポリシーなし＝ service role のみ。

Settings の接続リンクは相対パス（`/api/social/${platform}/connect?workspaceId=…`、`src/app/app/settings/page.tsx` 192 行）。

iOS 含意: Google（YouTube）は埋め込み WKWebView での OAuth を拒否する。ASWebAuthenticationSession が必要。Safari の Cookie と WKWebView の Cookie は共有されないため、現行の「callback で cookie `getUser()`」はネイティブブラウザ経由だとそのままでは成立しない。

---

## 3. `/api` 呼び出し（ブラウザ）

すべて相対 URL。CORS 設定なし。同一オリジン前提。

集約箇所: `src/lib/app/app-provider.tsx`

| 行付近 | 経路 |
|---|---|
| 590 | `POST /api/social/disconnect` |
| 610 | `POST /api/social/line/connect` |
| 630 | `POST /api/inbox/sync` |
| 783 | `POST /api/inbox/reply/generate` |
| 816 | `POST /api/inbox/reply/approve` |
| 834 | `POST /api/messaging/trigger` |
| 957 | `POST /api/calendar/sync` |
| 974 | `POST /api/inbox/schedule/extract` |
| 1118 | `POST /api/publish/trigger` |
| 1135 | `GET /api/analytics/metrics` |
| 1253 | `POST /api/drafts/generate` |

認証は Cookie セッション。Anthropic / service role / トークン復号はこれらの Route Handler 内に閉じている。

Cron（端末から呼ばない）: `vercel.json` → `/api/publish/run` `0 0 * * *`、`/api/messaging/run` `0 1 * * *`、`/api/messaging/auto-reply/run` `0 2 * * *`。いずれも `CRON_SECRET`。

Webhook（端末から呼ばない）: `/api/webhooks/meta`（`X-Hub-Signature-256`）、`/api/webhooks/line`（`X-Line-Signature`）。

---

## 4. ブラウザ → Supabase 直結

`/api` 以外の主経路。anon key + RLS。

- Repositories: `src/lib/repositories/supabase/*.ts`（seeds / drafts / queue / inbox / notifications / brand-profiles / audit 等）
- Upload: `src/lib/storage/supabase/supabase-asset-storage.ts` → bucket `assets`、署名 URL 1 時間
- 入口: `src/lib/seeds/assets.ts`、file input は `src/app/app/seeds/new/page.tsx` と `src/app/app/seeds/[id]/media/page.tsx`

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` はクライアントに載る（意図どおり、anon + RLS）。service role は載らない。

---

## 5. Browser-only API

| API | 用途 | 主な場所 |
|---|---|---|
| `navigator.share` / `canShare` | ゼロコスト投稿の共有シート | `src/components/publish/MobilePostShareButton.tsx`、`src/lib/services/web-share*.ts`、`/app/share-diagnostics` |
| Canvas 2D | 文字入りサムネ | `src/lib/media/thumbnail-compose.ts` 他 |
| `HTMLVideoElement` seek | 動画から静止画切り出し | `src/lib/media/thumbnail-stills.ts` |
| `MediaRecorder` | 16:9 / 9:16 クロップ | `src/lib/media/crop.ts` |
| `URL.createObjectURL` | プレビュー・書き出し | 複数 |
| `navigator.clipboard` | note / Pack のコピー | `queue/page.tsx`、`packs/page.tsx` |
| `window.open` | 各 SNS へのハンドオフ | queue / packs / QueueMediaKit |
| `<a download>` | ワークスペース JSON | `app-provider.tsx` 1175–1183 行 |
| `localStorage` | `activeWorkspaceId` のみ | `app-provider.tsx` 219, 326 行 |
| `sessionStorage` | ログイン OTP クールダウン | `login-otp.ts` |

Service Worker は存在しない。PWA は manifest + apple-touch-icon + `display: standalone` + `viewport-fit: cover` + `env(safe-area-inset-bottom)`。

---

## 6. CSP / Permissions-Policy

`next.config.mjs`:

- CSP: `base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'`（script-src は未指定＝ブラウザ既定）
- Permissions-Policy: `camera=(), microphone=(), geolocation=(), payment=(), usb=(), web-share=(self)`
- `X-Frame-Options: DENY`

iOS 含意: 同一 HTTPS を WKWebView で開く分には CSP は阻害しにくい。Web の `getUserMedia` カメラは自前の Permissions-Policy で禁止。写真ライブラリからの `<input type=file>` は別経路。後で Capacitor Camera プラグインを使う場合は Web Permissions-Policy を通らない。

---

## 7. 秘密情報の所在

クライアントに載ってよいもの: `NEXT_PUBLIC_SUPABASE_*`、`NEXT_PUBLIC_APP_URL`、`NEXT_PUBLIC_PUBLISHING_STRATEGY`。

サーバーのみ: `SUPABASE_SECRET_KEY`、`ANTHROPIC_*`、`CRON_SECRET`、`SOCIAL_TOKEN_ENCRYPTION_KEY`、各 SNS / LINE / Meta webhook / Notion / TimeTree。

正本: `.env.example`。iOS バイナリへ埋め込む対象は **ない**（この方針を維持すること）。

---

## 8. UI のクライアント偏重

主要ページはすべて `'use client'`。ルート `src/app/layout.tsx` だけが Server Component の殻。SSR の恩恵は薄い。Capacitor が HTTPS を開く場合も、ローカル静的書き出しする場合も、UI 層の制約は同じくらい。差が出るのは Cookie・相対 fetch・OAuth callback。

---

## 9. App Store 関連の有無

| 項目 | 状態 |
|---|---|
| PWA アイコン 192/512/180 | あり（`public/icons/*`、`src/app/apple-icon.png`） |
| Native App Icon / Launch Screen | なし（`ios/` 未生成） |
| Bundle ID / Signing | なし |
| Universal Links / URL Scheme | なし |
| Privacy Manifest | なし |
| プライバシーポリシーページ | なし |
| アカウント削除 | なし |
| SNS disconnect | あり |
| データエクスポート | あり（クライアント JSON） |
| アプリ内通知 | poll-on-load のみ。APNs なし |
| Share Extension | なし（Web Share のみ） |
| Push | なし |
| TestFlight / App Store Connect | なし |

---

## 10. 推奨ランタイム（監査結論）

**v1 は Capacitor で本番 HTTPS を開く（remote URL）。ローカル `capacitor://` バンドル + リモート API は、現行 Cookie セッションと相対 `/api` を壊す。**

ただし remote URL でも、マジックリンクと Google OAuth は「Safari と WKWebView の Cookie が別」という問題が残る。これが iPhone 実機での最初の本番ブロッカーである。
