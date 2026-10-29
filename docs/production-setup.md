# 本番（Vercel＋ホスト版Supabase）で使い始める手順

日常使い（スマホからも）は、ローカルではなく本番の URL で行う。ローカルのSupabaseは開発用で、データは手元のMacにしかない。

- アプリ: `https://my-sns-yoshirouself.vercel.app`（Vercelプロジェクト `my-sns`）
- データ: ホスト版Supabase（`https://dcllyoaujhdgjjqokwkq.supabase.co`）
- 独自ドメインを使う場合は §5。

以下の操作は**本人が行う**もの（アカウント・キー・課金・DNSに関わるため）。Vercel / Supabase / 各SNSの管理画面は変わることがあるので、名称が違う場合は近い項目を探す。

## 1. Supabase（ホスト版）

1. **マイグレーションを適用**する（最新は `20260829000000_repoint_jobs_on_reconnect.sql`）。
   ```bash
   npx supabase login
   npx supabase link --project-ref dcllyoaujhdgjjqokwkq
   npx supabase db push
   ```
   途中でDBパスワードを聞かれる。押す前に `npx supabase db push --dry-run` で内容を確認できる。
2. **Authentication > URL Configuration**
   - Site URL: `https://my-sns-yoshirouself.vercel.app`
   - Redirect URLs に `https://my-sns-yoshirouself.vercel.app/**` を追加。
3. **Authentication > Providers > Email**
   - 一人で使うなら「Confirm email」をオフにすると、アカウント作成後すぐ入れる。
   - オンのままにする場合、確認メールが届く。Supabase標準のメール送信は回数制限が厳しいので、独自SMTPの設定を勧める。
4. **Storage**: 1ファイルの上限（既定50MB）はプランで決まる。動画を大きく扱うなら、上限を上げたうえで Vercel に `NEXT_PUBLIC_MAX_UPLOAD_MB` も設定する。

## 2. Vercel の環境変数

**Project > Settings > Environment Variables**（Production）に設定する。`NEXT_PUBLIC_` で始まる値はビルド時に埋め込まれるので、変更後は**再デプロイ**が必要。

| 変数 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dcllyoaujhdgjjqokwkq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase の anon / publishable key |
| `SUPABASE_SECRET_KEY` | Supabase の service_role key（**秘密**。Vercel以外に書かない） |
| `NEXT_PUBLIC_APP_URL` | `https://my-sns-yoshirouself.vercel.app`（末尾スラッシュなし） |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | 本番用に新しく作る: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`。**後から変えると保存済みのSNSトークンが読めなくなる** |
| `CRON_SECRET` | 十分長いランダム文字列 |
| `DEEPSEEK_API_KEY` | DeepSeek Platform で発行したキー |
| `AI_INPUT_COST_PER_MTOK` / `AI_OUTPUT_COST_PER_MTOK` / `AI_MONTHLY_BUDGET_USD` | 任意。費用の見積りと月次上限（`.env.example` 参照） |
| `NEXT_PUBLIC_PUBLISHING_STRATEGY` | 空のまま＝手動投稿モード。自動投稿にするときだけ `api-first` |

設定後、**Deployments > 最新 > Redeploy**。アプリの **設定** 画面で「AI連携」の接続テストと、各媒体の設定状況を確認する。

## 3. 重複プロジェクトの整理

同じリポジトリから Vercel プロジェクトが2つ（`my-sns` と `mysns`）作られている。`mysns-yoshirouself.vercel.app` は実行時に500エラーを返している（環境変数が未設定の可能性が高い）。使わないほうを **Settings > Advanced > Delete Project** で消すか、GitHub連携を外す（PRごとの重複デプロイも止まる）。

## 4. 各SNSの開発者アプリ（自動投稿にする場合）

Redirect URI は次の形。設定画面の各媒体の「手順を見る」にも同じ値が出る。

- X: `https://my-sns-yoshirouself.vercel.app/api/social/x/callback`
- Instagram（Meta）: `…/api/social/instagram/callback`（Webhook: `…/api/webhooks/meta`）
- YouTube（Google）: `…/api/social/youtube/callback`
- TikTok: `…/api/social/tiktok/callback`

Instagram と TikTok は HTTPS の公開URLが必要なので、ローカルではなくこの本番URLで登録する。手動投稿モードのままなら、ここは不要。

Vercel の Hobby プランの Cron は1日1回まで（`vercel.json`）。急ぎの投稿はキューの「今すぐ公開」を使う。

## 5. 独自ドメインにする（任意）

1. ドメインを取得する（お名前.com・Cloudflare Registrar など）。
2. Vercel の **Project > Settings > Domains** に追加し、表示されるDNSレコードを設定する。
3. `NEXT_PUBLIC_APP_URL` を新しいURLにして再デプロイする。
4. Supabase の Site URL / Redirect URLs、各SNS開発者アプリの Redirect URI を新URLに直す（**古いURLのまま**だと接続とログインが失敗する）。
5. すでに接続したSNSアカウントは、Redirect URI が変わるため再接続が必要になる場合がある。

## 6. 動作確認チェックリスト

- [ ] `/login` が開き、アカウント作成→ログインできる
- [ ] ワークスペースを作成できる
- [ ] 設定 > AI連携で「接続テスト」が成功する
- [ ] Seedを作り、写真や動画を入れて下書きを作成できる（AI提案と表示される）
- [ ] 「まとめて送る」で公開予定に追加でき、投稿後に「投稿済みにする」を押せる
- [ ] スマホのブラウザで開き、ホーム画面に追加できる
