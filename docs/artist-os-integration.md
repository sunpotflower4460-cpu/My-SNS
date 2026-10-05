# Artist OS 連携（読み取り専用）

Artist OS（横断管制の別リポジトリ）が My-SNS の状態を**読む**ための窓口。My-SNS が Seed・下書き・承認・投稿・Inbox の唯一の正本であることは変わらない。

| ルート | 認証 | 内容 |
|---|---|---|
| `GET /api/service/health` | なし（秘密・テナントデータなし） | バージョン、能力、設定の健全性（未設定なら `degraded`） |
| `GET /api/service/v1/status` | `Authorization: Bearer $ARTIST_OS_SERVICE_TOKEN` | 承認待ち下書き・失敗した投稿/返信・予約済み/公開済みジョブ・Inbox要対応数の射影 |

## 守っていること

- **読み取り専用**。承認・返信承認・今すぐ公開はこのトークンでは行えない（人間のセッションとロール確認が必要なため、Artist OS は My-SNS の画面へのリンクを出すだけ）。
- トークンは**1つのワークスペースに固定**（`ARTIST_OS_WORKSPACE_ID`）。service role は RLS を迂回するため、全クエリを `workspace_id` で絞り、列を許可リストで選ぶ。`social_account_credentials` / `oauth_states` には触れない。
- `CRON_SECRET` とは別のトークン（あちらは投稿を起動できる）。未設定なら 503（fail-closed）。
- プロバイダのエラー文言は返さない。DBエラーも返さない（502の汎用文言）。
- 契約は Artist-OS の `src/contracts/service.ts`（contractVersion 1）。

## 注意

- 承認は ブラウザ→Postgres RPC のため、イベント通知は無い。Artist OS はポーリングする。
- 投稿cronは Vercel Hobby で1日1回。予約時刻はあくまで予定で、実行は遅れうる。
