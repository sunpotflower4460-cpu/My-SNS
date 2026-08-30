# CLAUDE.md — My-SNS / Creator Hub

このリポジトリで作業する際の基準は、常に **Seed を中心とした発信管制OS** という構想である。SNSアカウントではなく Seed（発信の種）が情報の親であり、各媒体向けの成果物はそこから生成される子である。

- 全体構想・思想・避けるべきことは `docs/master-plan.md` を参照する。PRの実装順は同ファイル §5 に従う。
- エグゼクティブサマリー・ユースケースは `docs/concept.md` を参照する（背景理解用、実装仕様は master-plan.md が優先）。

## 作業の原則

1. **PRの順序**は `docs/master-plan.md` §5 に従う。1PRは最小スコープで完結させ、レビュー可能な単位に保つ。
2. **完了前に必ず実行**する検証: `npm run lint && npm run typecheck && npm test && npm run build`。すべて成功してからPRを準備する。
3. **UIを壊さない**。Phase 2Aで確立した見た目・操作感を維持し、既存ページフローを壊す変更は避ける。
4. **AIは提案者であり代理人ではない**。Seedの原文・事実・CTAをAIが無断で上書きしてはならない。AIが推測した箇所は `assumptions` として明示し、ユーザーの承認を経てはじめてRevisionとして確定する。
5. **投稿の追跡は正直に行う**。投稿ID・URL・`published` 状態は実際に確認できた時だけ記録する。connectorやAIが未設定・未実装の場合は fail-closed（偽の成功を返さず安全に停止）にする。
6. **秘密情報はコードに書かない**。APIキー・トークンは環境変数または Supabase Vault を使う。GitHubやログへ露出させない。
7. **noteは公式APIがない**。自動投稿を装わず、review + copy（確認してコピーする）導線に留める。

## 主要ファイルの場所

| 領域 | ファイル |
|---|---|
| Draft生成の抽象 | `src/lib/services/interfaces.ts`（`DraftGeneratorService`）/ 実装は `src/lib/services/ai-draft.ts` |
| 投稿コネクタの抽象 | `src/lib/services/interfaces.ts`（`SocialConnectorAdapter`）/ 実装は `src/lib/services/social-connector.ts`（未実装時は fail-closed） |
| チャンネル定義 | `src/lib/domain/types.ts`（`PublishingChannel`, `CORE_PUBLISHING_CHANNELS`）/ 表示設定は `src/lib/channels/config.ts` |
| Seed | `src/lib/repositories/supabase/seeds.ts` / readiness判定は `src/lib/seeds/readiness.ts` |
| Brand Profile | `src/lib/repositories/supabase/brand-profiles.ts` |
| 予約・投稿実行 | `publish_jobs`（PR3以降で `publish_attempts` を追加）、Workerは境界を明確に分離する |

## 現在地（更新: 2026-08-28）

- PR0: Supabase基盤の正常化 — マージ済み
- PR1: Seed / Brand Profile 基盤 — マージ済み
- PR2: AI提案＋承認（`/api/drafts/generate`、`draft_revisions`、`ai_generations`） — マージ済み
- PR3: Scheduling Engine（`publish_jobs.publish_mode`/`revision_id`、`publish_attempts`、Worker `/api/publish/run`） — マージ済み。実コネクタは未接続のため`auto`投稿は`unavailable`で安全に失敗する。
- PR4: X＋Instagram コネクタ（OAuth接続、トークン暗号化保存`social_account_credentials`、実投稿アダプタ） — マージ済み。Seedアセットから署名URLを解決して投稿する（`resolvePublishMediaMetadata`）。メディア未添付時は明示的なエラーで安全に停止する。
- PR5: YouTube＋TikTok コネクタ＋noteハンドオフ — マージ済み。**MVP完成**（`docs/master-plan.md` §4）。メディアもSeedアセット解決で対応。noteはMarkdownコピー＋手動完了記録で完結。
- PR6: Webhook受信＋Unified Inbox — マージ済み（MVP後拡張の第一弾）。Instagramのコメント・DMは署名検証済みWebhook（`/api/webhooks/meta`、`X-Hub-Signature-256`）で自動取り込み。YouTubeは実コメントAPIを使ったプル型「Sync inbox」ボタンで取得。同一イベントの重複取り込みは`inbox_items.external_id`＋ユニークインデックスで防止。X・TikTokのコメント/メンション/DM取得、Instagramのmentions解決（webhookペイロードがテキストを含まない）は、それぞれAPIアクセス階層・追加審査・追加API呼び出しが必要という正直な理由付きで未対応のまま。
- PR7: Analytics＋AI学習 — マージ済み。新しい`/app/analytics`ページで、`publish_attempts`/`ai_generations`/`draft_revisions`から実データのみで媒体別成功率・失敗理由内訳・AIコスト・AI提案の人間編集率を表示。YouTube/Xは実際の視聴回数・いいね・コメント数をオンデマンド取得（`fetchMetrics`、既存スコープでカバー済み）。Instagram/TikTokのメトリクスは追加スコープ・審査が必要な正直な未対応。`social_drafts`/`draft_revisions`に`ai_original_snapshot`列を追加し、AI提案が最初に保存された時点の内容を凍結、人間が編集して承認したRevisionとの差分を次回の`/api/drafts/generate`呼び出しへfew-shot例として渡す（`DraftGenerationContext.styleExamples`）。
- PR9: 通知＋モバイル最適化＋バックアップ＋費用管理 — マージ済み。アプリ内通知（プッシュではなくpoll-on-load、既存の`refreshWorkspaceData()`と同じタイミングで更新）を追加し、承認待ちドラフト・投稿失敗・チームメイトによるinbox要対応フラグを通知。xlブレークポイント未満（スマホ・大半のタブレット）でSidebarが完全に消えていた実バグを、MobileNavドロワー（ハンバーガーメニュー）で修正。Settingsに「Export workspace data」ボタン（Seed・Brand Profile・承認済みRevision・投稿履歴をJSONダウンロード、サーバー側の書き出しパイプラインなし）を追加。`ANTHROPIC_MONTHLY_BUDGET_USD`（任意）で月次AI予算の上限を設定可能に。「共同承認」は複数承認者への通知fan-outとして実装し、二重承認必須化ではない — 明示的なスコープ判断として記録。
- 日本語UI対応 — マージ済み。
- 信頼性ハードニング（#74〜#76）— マージ済み。
- 公開経路の拡張（サムネイル／カバー実ファイル、予約時刻でのYouTube・TikTok自動実行、16:9/9:16バリアント、同一媒体の複数アカウント）— 実装済み。下書き作成または素材ページで、動画から静止画を切り出し巨大な日本語フック（3〜8文字）を焼き込んだ1280×720サムネイルを2〜3枚自動生成する。YouTube案には一番強い候補が選ばれ、スタジオで切り替えられる。TikTokも同じWorkerで自動実行するが、監査前はSELF_ONLYのまま。カスタムサムネイルにはYouTube再接続（`youtube.force-ssl`）が必要な場合がある。CronはVercel Hobby制約で1日1回（`vercel.json`）。急ぎはQueueの「今すぐ公開」。
- 次: PR8 公式サイト／作品母艦との統合（実サイトの詳細が必要なため、ユーザーとの要件確認が前提）

## 最後にまとめて行う本人操作

以下はコードと案内画面を先に用意し、最終統合段階でまとめて行う。本人以外（Claude含む）が代行できない、あるいは代行すべきでない操作である。

- 本番Supabaseプロジェクトへのmigration適用と環境変数設定
- AIプロバイダーのAPIキー発行・予算設定
- X (Developer Console)、Google Cloud (YouTube Data API/OAuth)、Meta (Instagram Business/Creator連携)、TikTok (Developer account) の開発者登録
- 各SNS OAuthのredirect URL・審査申請
- 実アカウントでの接続承認とテスト投稿
