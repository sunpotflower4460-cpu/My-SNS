# My-SNS iOS / App Store 化計画（PRE-0）

更新日: 2026-09-02  
対象: `sunpotflower4460-cpu/My-SNS`  
前提: 調査・設計のみ。Capacitor 導入、`ios/` 生成、スキーマ変更、OAuth 仕様変更、Web 版の削除・フォークは行わない。

詳細なファイル証拠は `docs/ios-architecture-audit.md` を参照する。

---

## Current Architecture

いまの My-SNS は **単一の Next.js アプリ** である。Vercel 上の同じプロセスが、画面と Secure Backend の両方を担う。

```text
Browser / iOS Safari / PWA
  ├─ CSR UI（ほぼ全ページが 'use client'）
  ├─ AuthProvider / AppProvider
  ├─ 相対 fetch('/api/...')     ← Cookie セッション
  └─ Supabase JS（anon + RLS）  ← Seed / Queue / Inbox / Storage の主経路

Vercel (Next.js)
  ├─ Route Handlers /api/*
  │    ├─ Anthropic（draft / reply / schedule）
  │    ├─ SNS OAuth connect/callback/disconnect
  │    ├─ Publish / messaging workers（CRON_SECRET）
  │    └─ Meta / LINE webhooks（署名検証）
  ├─ middleware（Cookie セッション refresh。認証ゲートではない）
  └─ Cron（vercel.json、Hobby は1日1回）

Supabase
  ├─ Auth（マジックリンク / PKCE / Cookie）
  ├─ Postgres + RLS
  └─ private Storage `assets`（署名 URL 1時間）
```

認証は `signInWithOtp` + `emailRedirectTo = window.location.origin + '/app/dashboard'`。専用 `/auth/callback` は無い。SNS OAuth の redirect は `NEXT_PUBLIC_APP_URL`（なければ request origin）の `/api/social/{platform}/callback`。

秘密情報（Anthropic、service role、SNS Client Secret、トークン暗号鍵、CRON_SECRET）はサーバー env のみ。iOS バイナリへ埋め込む対象は存在しない。この境界は維持する。

PWA は既にある（manifest / apple-icon / standalone / safe-area）。Service Worker は無い。ゼロコスト投稿は `navigator.share()` による OS 共有シートが主経路の一つ。

---

## What Can Stay As-Is

Web 版を壊さず、iOS でも **そのまま使い続ける** もの。

- Seed / Brand Profile / AI draft / Publish Pack / Queue / Inbox / Analytics のデータモデルと RLS
- Anthropic・SNS 投稿・Webhook・Cron をサーバーに閉じる fail-closed 設計
- ブラウザから Supabase への anon + RLS 直結（Seed 保存、素材 upload、Queue 操作）
- SNS disconnect、ワークスペース JSON エクスポート
- note の review + copy、ゼロコスト共有シート、Honest な未対応表示
- Vercel ホスティング、CI（lint / typecheck / test / build / Playwright）
- 既存 PWA。iOS アプリは PWA の置換ではなく、日常利用の別ランタイム
- Swift での全面書き換えはしない。Next.js / React を Core として残す

---

## iOS Blockers

実機で「ログインして今日の投稿を出す」までに必ず当たるもの。優先度順。

1. **マジックリンクがアプリに戻らない**  
   メールのリンクは Safari で開く。WKWebView と Safari は Cookie を共有しない。Universal Links か、アプリ内に入力する OTP がないと、アプリ内セッションが成立しない。

2. **相対 `fetch('/api/...')` + CORS なし + Cookie セッション**  
   Capacitor のローカルオリジン（`capacitor://` / `http://localhost`）から Vercel の `/api` を叩くと、Cookie が乗らず CORS も無い。現行のままでは壊れる。

3. **YouTube（Google）OAuth は WKWebView 内で完了できない**  
   Google は埋め込み WebView の OAuth を拒否する。ASWebAuthenticationSession が必要。その Cookie ジャーは WKWebView と別なので、現行 callback の `getUser()` もそのままでは成立しない。

4. **App Store Review 4.2（Minimum Functionality）**  
   公開サイトを WKWebView で包んだだけのアプリはリジェクトされやすい。PWA と差のないシェルでは不十分。Share Extension・ネイティブ共有・ファイル取り込みなど、アプリ固有の価値が要る。

5. **アカウント削除が無い（5.1.1(v)）**  
   マジックリンクはアカウント作成になる。App Store は作成できるアプリに削除導線を要求する。いまは `signOut` のみ。

補助ブロッカー: プライバシーポリシー URL が無い。`MediaRecorder` / 動画シークによるサムネ生成は WKWebView で欠ける可能性がある。APNs は未実装（アプリ内 poll のみ）。Bundle ID / Signing / Privacy Manifest は未着手。

---

## Security Boundaries

iOS 化しても動かさない線。

```text
My-SNS Core（共有 UI / domain / RLS 前提の repositories）
├─ Web runtime（Safari / PWA / デスクトップ）
└─ iOS runtime
     └─ Capacitor WKWebView + 必要なときだけ native bridge

Secure Backend（Vercel に残す。iOS バイナリに入れない）
├─ Anthropic
├─ SNS OAuth client secret と token 暗号
├─ Publish / messaging APIs と Cron
├─ Webhooks
└─ privileged Supabase（service role）
```

禁止:

- `ANTHROPIC_API_KEY` / `SUPABASE_SECRET_KEY` / SNS Client Secret / `SOCIAL_TOKEN_ENCRYPTION_KEY` / `CRON_SECRET` を Info.plist・ソース・`NEXT_PUBLIC_` へ置くこと
- iOS から service role で DB を叩くこと
- Webhook 受信をアプリ内で行うこと
- 偽の投稿成功をネイティブ側で作ること

公開してよいもの（現行どおり）: `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_APP_URL`。anon key は RLS 前提の公開鍵であり、アプリに含めても「秘密の埋め込み」にはならない。ただし iOS では ATS と Redirect URI の固定が要る。

---

## Web / Native Shared Architecture

フォークしない。**v1 の iOS は本番 HTTPS を WKWebView で開く**（Capacitor `server.url` = 既存 Vercel origin）。これが Cookie・相対 `/api`・既存 OAuth callback を最も壊さない形である。

ローカル静的バンドル（`capacitor://localhost` + リモート API）は将来の選択肢だが、CORS・credentials・Auth の作り直しが必要で、Phase 1 の目標ではない。

概念上の境界（実装は Phase 0 で **Web 既定が今と同一** な薄い adapter にする）:

| Adapter | Web 既定（今の挙動） | Native で後から差すもの |
|---|---|---|
| Runtime | `web` | Capacitor 検出。未導入時は常に `web` |
| API Client | 相対 URL `fetch('/api/...')` | Native かつ local-shell のときだけ Backend Base URL。v1 remote URL では使わない |
| Auth Redirect | `window.location.origin + '/app/dashboard'` | Universal Link / カスタムスキーム、または OTP 入力 |
| Share | `navigator.share` / `canShare`。非対応なら既存のコピー＋開く | `Share` プラグイン。同じボタンから呼ぶ |

Phase 0 で全 `fetch('/api/...')` を一気に書き換えない。まず adapter を足し、呼び出し点を **追加の薄い関数に寄せる**。Web の URL・Cookie・エラー文は変えない。テストで「相対 URL のまま」を固定する。

SNS OAuth の仕様（redirect URI、state、PKCE、サーバー callback）は Phase 0–1 では変えない。iOS からの新規 YouTube 接続は Phase 2。Phase 1 は **Web で既に接続済みのアカウントを使う日常利用** を先に成立させる。

---

## Phase 0

目的: Capacitor を入れずに、後から Web を壊さず差せる継ぎ目だけを用意する。

やってよいこと:

1. `src/lib/platform/runtime.ts` — `web` / `ios-native`。Capacitor 未導入なら常に `web`
2. `src/lib/platform/api-client.ts` — 現状は相対 `fetch` のラッパ。Base URL 上書きは未使用
3. `src/lib/platform/auth-redirect.ts` — `emailRedirectTo` の単一入口。Web は今と同じ `origin + '/app/dashboard'`
4. `src/lib/platform/share.ts` — `MobilePostShareButton` から Web Share を呼ぶ口。失敗時は既存 fallback
5. 上記の単体テスト（Web 既定が現行と等しいこと）

やってはいけないこと: Capacitor インストール、`ios/` 生成、`package.json` の不必要な変更、スキーマ変更、OAuth redirect の変更、UI の大きな変更、Vercel 削除、Secret の追加。

完了条件: Web の `lint` / `typecheck` / `test` / `build` / e2e が緑。画面上の文言・導線がユーザーから見て変わらない。

---

## Phase 1 — iPhone Device Build

目的: 実機でログインし、既存ワークスペースを開き、Pack / Queue の共有またはコピーができる。App Store 提出はまだしない。

工程の目安:

1. Apple Developer プログラム、Bundle ID（所有ドメインの reverse-DNS。未決定）
2. Capacitor を **追加**（Web ビルド成果を消さない）。`server.url` を本番 HTTPS に固定
3. Xcode で Signing、実機 Run。ATS は Vercel / Supabase の HTTPS のみ許可
4. マジックリンク対策の最小実装（どちらか、または両方）  
   - Associated Domains + Universal Links で `/app/dashboard` をアプリが受け取る  
   - メール内コードをアプリに入力する OTP（Cookie 交換はアプリ内）
5. ログイン済みで Seed / Pack / 共有診断が動くことを実機確認
6. サムネ自動生成と `MediaRecorder` クロップは「動くなら使う、欠けたら既存の PNG/JPG アップロードへ fail-closed」と明記
7. SNS の **新規** Google 接続はこの Phase の必須条件にしない（Web の Settings で接続）

Web 版はこれまでどおり Vercel で配信する。iOS は同じ URL を開くシェルである。

---

## Phase 2 — Native Experience

目的: PWA のブックマークではない、アプリ固有の価値。App Store 4.2 対策の本体。

- Share Adapter を iOS `Share` シートへ。Web Share が弱い端末でも Pack から同じボタンで渡す
- （必要なら）Share Extension。他アプリから素材を Seed へ入れる
- ファイル取り込みを Capacitor Filesystem / Photos で補強。Web の `<input type=file>` は残す
- YouTube 接続: ASWebAuthenticationSession。サーバー OAuth の **仕様を変えるなら** この Phase で、Web の redirect URI は維持したまま native 用の完了経路を足す（既存 Web callback を壊さない）
- ステータスバー / safe-area / スプラッシュは Capacitor 標準。既存の `env(safe-area-inset-bottom)` を活かす
- アプリ内通知の poll は残す。APNs はこの Phase では任意（無くても日常利用は可能）

ここでも Anthropic と SNS 投稿実行はサーバー側のまま。

---

## Phase 3 — App Store Ready

目的: Review 提出可能な品質。機能追加よりコンプライアンス。

必須:

- 公開 HTTPS のプライバシーポリシー（AI への送信、Supabase、各 SNS、エクスポート、削除を書く）
- アプリ内からポリシーを開けること
- アカウント削除（作成できるので必須）。関連 Seed / 接続の扱いを正直に書く
- SNS disconnect は既存をそのまま案内
- Privacy Manifest（使うプラグインに応じた必須理由 API）
- App Privacy 設問（トラッキング広告はしていない想定。Anthropic は「アプリ機能のための第三者」）
- App Icon / Launch Screen（既存 PWA PNG を素材に、1024 を別途用意）
- `ITSAppUsesNonExemptEncryption`（アプリ内に独自暗号を持たず HTTPS のみなら、該当なしで出せる想定。サーバー側 AES はアプリに含まれない）
- TestFlight 内部テスト → 外部テスト
- Review メモ: テストアカウント、マジックリンクの手順、AI は提案であり自動投稿しないこと、note に公式 API が無いこと

任意・後回し: APNs、Watch、Widget。課金は今の製品に無い。

---

## App Store 前提チェックリスト

| 項目 | 現在 | 不足 | 入れる Phase |
|---|---|---|---|
| iOS Bundle ID | なし | 決定と登録 | 1 |
| Signing / Team | なし | Apple Developer | 1 |
| Deep Links / Universal Links / URL Scheme | なし | Associated Domains。マジックリンク用 | 1 |
| Privacy Manifest | なし | プラグイン確定後 | 3 |
| Privacy Policy | なし（docs に SNS 審査の言及のみ） | 公開 URL + アプリ内リンク | 3 |
| Account deletion | なし | Settings に削除。サーバーで Auth user 削除 | 3 |
| SNS disconnect | あり | 維持 | — |
| AI へのデータ送信説明 | なし | ポリシーと生成 UI の短い注記 | 3 |
| App permissions | Web は camera/mic を Permissions-Policy で禁止 | Photos / Share を足すなら用途説明 | 2–3 |
| Share Extension | なし | 4.2 の有力候補 | 2 |
| Push Notifications | アプリ内 poll のみ | APNs は任意 | 2 以降 |
| App icon / Launch Screen | PWA 用 180/192/512 | xcassets + 1024 | 1 / 3 |
| TestFlight | なし | 内部テスト | 1 末〜3 |
| App Store Review | なし | 4.2 / 5.1.1 を満たしてから | 3 |

---

## Risks

- **remote URL シェルが「ただのウェブサイト」に見える。** Phase 2 なしで提出すると 4.2 で落ちやすい。
- **Phase 0 で API Client を広く差し替えると Web が壊れる。** 既定は相対 URL。テストで固定する。
- **Google OAuth を Phase 1 の必須にすると長期化する。** 接続は Web、利用はアプリ、と分ける。
- **WKWebView でサムネパイプラインが欠ける。** 欠けるなら既存の静止画アップロードへ倒す。自動成功にしない。
- **Hobby Cron は1日1回。** アプリ化しても予約投稿の「今すぐ」以外は変わらない。正直な説明を維持する。
- **Universal Links の AASA ミス** でマジックリンクが Safari に吸い続けられる。OTP 入力を併設すると救済になる。
- 未決事項（仮定）: Bundle ID、Apple Team、本番の最終ドメイン、プライバシーポリシーの公開場所。実装時に本人が決める。

---

## Recommended Implementation Order

1. 本計画の確認（PRE-0。いまここ）
2. Phase 0: platform adapter 4 つ。Web 挙動をロックするテスト
3. Phase 1: Capacitor remote URL、実機、マジックリンクまたは OTP、Pack 共有の確認
4. Phase 2: ネイティブ共有 / 必要なら Share Extension /（任意）YouTube 接続のシステムブラウザ
5. Phase 3: 削除・ポリシー・Manifest・アイコン・TestFlight・提出

Web の機能削除、Vercel 削除、Swift 全面書き換え、Secret のクライアント化はどの Phase でもやらない。

---

## Definition of Done

### PRE-0（本ドキュメント）

- [x] 現行アーキテクチャと iOS 影響箇所を書いた
- [x] 残すもの / ブロッカー / セキュリティ境界 / 共有構造を書いた
- [x] Phase 0–3 と App Store チェックリストを書いた
- [ ] コード変更・Capacitor 導入はしていない（意図どおり）

### 後続 Phase の完了（まだやらない）

- Phase 0: adapter 導入。Web の CI 全緑。ユーザーから見て Web が変わらない
- Phase 1: 実機でログイン → ワークスペース → Pack/Queue の共有またはコピーまで通る
- Phase 2: Web に無いネイティブ価値が 1 つ以上ある（共有シートの安定化または Share Extension）
- Phase 3: アカウント削除とプライバシーポリシーを含む状態で TestFlight に載せ、Review 提出資料が揃う

最終目標（日常利用できる iOS アプリとして App Store に出せる）は Phase 3 完了時。PRE-0 の完了条件は「実装せずに設計がレビュー可能なこと」である。
