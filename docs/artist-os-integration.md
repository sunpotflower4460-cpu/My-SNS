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

## Managed mode（Artist OS 管理下）

`ARTIST_OS_MODE=artist_os_managed` で明示的に有効化する（未設定＝`standalone`、従来どおり。不正な値は最も厳しい managed 扱いで `modeInvalid` として報告）。

- My-SNS は **inbound の正本**であり **Meta webhook の canonical receiver**。外部返信（現状は LINE のみ実送信）は **Artist OS の Action Ledger** で `reserve → begin → send → complete` を踏んでからでないと送らない。
- ledger 未設定・到達不能・未知の応答・`ALREADY_*`・`OUTCOME_UNKNOWN`・`CONFLICT` のどれでも **送信しない**（fail closed）。プロバイダの結果が不明（タイムアウト等）なら `OUTCOME_UNKNOWN` を記録し、人間が照合するまで誰も再送しない。送信が確実に拒否された（`LINE push failed (4xx)`、408/409/425を除く）場合のみ `failed_safe`。
- 冪等キーは `platform:operation:<プラットフォームのネイティブなイベントID>`。返信本文のハッシュは使わない。
- 通常の予約投稿（publish）はこの ledger に依存しない。
- 追加ルート: `GET /api/service/v1/inbound-events`（読み取り専用。公開コメントのみ本文抜粋、DM本文は返さない）。`/api/service/health` に `runtimeMode` / `ownership` を追加。
