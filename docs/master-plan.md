# My-SNS / Creator Hub — マスタープラン v2

更新日: 2026-07-16　参照: `docs/concept.md`（構想の全文）、`CLAUDE.md`（作業ルール）

> 本書は実装の基準書である。PRの実装順、各PRのスコープ、媒体別の自動化方針、MVP完了条件、避けるべきことを定義する。

## 0. 位置づけ

中心はSNSアカウントではなく **Seed（発信の種）** である。Seedに元の文章・動画・画像・音源・目的・伝えたいこと・対象者・CTAを保存し、そこから各媒体向けの表現を枝分かれさせる。AIは提案者であり、勝手な代理人ではない。

## 1. 変えない6原則

1. **SNSを親にしない** — Seedが親、各SNS投稿はSeedから生成された子。
2. **AIは提案者** — 不足情報や表現を提案するが、事実やCTAを黙って上書きしない。
3. **世界観を毎回説明し直さない** — Brand Profileに集約し、生成のたびに再利用する。
4. **完全自動化より信頼できる自動化** — 脆い自動化より、公式連携・fail-closed・監査ログを優先する。
5. **手動作業は最後へ集約する** — 本番Supabase適用、APIキー、OAuth審査など本人操作は、対応コードが揃った最終統合段階にまとめる（§6参照）。
6. **発信資産を蓄積する** — Seed・承認版・公開結果・反応を消費物にせず、再利用できる資産として保存する。

## 2. PRロードマップ

| PR | テーマ | 状態 |
|---|---|---|
| PR0 | Supabase基盤の正常化 | ✅ マージ済み (#6) |
| PR1 | Seed / Brand Profile 基盤、5標準チャンネル、readiness、note review+copy方針 | ✅ マージ済み (#7) |
| PR2 | AI提案＋承認 | ✅ マージ済み |
| PR3 | Scheduling Engine | 次に着手 |
| PR4 | X + Instagram コネクタ | PR3の後 |
| PR5 | YouTube + TikTok コネクタ + note handoff（ここまででMVP） | PR4の後 |
| PR6 | Webhook + Unified Inbox | MVP後 |
| PR7 | Analytics + AIの学習 | MVP後 |
| PR8 | HP／作品母艦統合 | MVP後 |
| PR9 | 運用仕上げ（通知、共同承認、バックアップ、費用管理） | MVP後 |

## 3. 媒体別の自動化方針（MVP publishMode）

| 媒体 | publishMode | 監査後 | 主な制約 |
|---|---|---|---|
| X | `auto` | — | 投稿コストの目安 $0.015〜$0.20/URL付き投稿。429レート制限は1回リトライ。 |
| YouTube | `assisted`（PR5） | `auto` | 1日100クォータ目安。Shorts判定は9:16 + `#Shorts`。resumable upload。失敗時はStudioへのリンクへフォールバック。 |
| Instagram | `auto` | App Review後 | Business/CreatorアカウントかつFacebook連携必須。メディアは公開URLが必要（→Supabase Storageの署名URL、有効期限1時間)。Reels API。100 calls/24h目安。 |
| TikTok | `draft`（inbox） | `auto`（監査後） | Direct Post APIは初期 `SELF_ONLY` スコープ。`FILE_UPLOAD`/`PULL_FROM_URL`。動画15分以内。AIGCラベル。6 req/min目安。 |
| note | `manual` | — | 公式APIなし。AIが生成 → 手動コピー → note.comへ貼付 → 完了記録。Markdown/CSS対応の1クリックUIで導線を作る。 |

`delivery` (channels/config.ts) と `publishMode` (PR3以降) は別概念: `delivery` はチャンネルの性質（`api-later` / `manual-copy` / `owned-channel`）、`publishMode` はPR3で導入するJobレベルの実行モード（`auto` / `assisted` / `draft` / `manual` / `owned`）。noteは常に `manual` として扱い、Queue/UIで手動完了を記録する。

## 4. MVP完了条件

- [x] Seedに文章・ファイル・目的・重要点・対象媒体を一度だけ入力できる（PR1）
- [x] Brand Profileを5媒体分の生成に再利用できる（PR1）
- [x] 実AIが構造化された媒体別ドラフトを生成する（PR2、`ANTHROPIC_API_KEY`未設定時はテンプレートへ明示的にフォールバック）
- [x] 不足情報・AIの推測箇所（assumptions）が明確に区別される（PR2）
- [x] 媒体別の修正・承認を行い、承認版（Revision）を固定できる（PR2、`draft_revisions`は追記専用）
- [ ] X・Instagram・YouTubeのうち利用可能な連携先へ予約または即時投稿できる（PR3〜PR5）
- [ ] TikTokは権限に応じて自動投稿または承認済み受け渡しができる（PR5）
- [ ] noteは完成原稿の確認・コピー・手動完了記録まで短い導線で行える（PR5）
- [ ] 投稿成功・失敗・URL・再試行・手動完了がQueueで追跡できる（PR3）
- [ ] AIやconnectorが未設定・失敗した場合、偽の成功表示をせず安全に停止する（fail-closed、PR2〜PR5全体で維持）

## 5. 各PRの実装仕様

### PR2 — AI提案＋承認

- `AnthropicDraftGeneratorService implements DraftGeneratorService`（`src/lib/services/interfaces.ts`）。API未設定時は `TemplateDraftGeneratorService`（既存）にフォールバックし、フォールバックである旨をUIに明示する。
- Next.js API route: `src/app/api/drafts/generate/route.ts`。`@anthropic-ai/sdk` を使用し、APIキーは環境変数（`ANTHROPIC_API_KEY`）のみから読む。
- JSON出力契約（共通）: `{ title?, body, hashtags[], cta?, assumptions[] }`
  - YouTube: `{ description, chapters?, thumbnailTextIdeas[] }`
  - X: `{ thread?: string[] }`
  - Instagram / TikTok: `{ coverText?, hook? }`
  - note: `{ markdown, eyecatchIdeas[] }`
  - `assumptions[]` は必ずUIに表示し、ユーザーが確認できるようにする。
- 生成にはBrand Profile（voice/values/preferredTerms/avoidedTerms/defaultCallToAction）とSeedのgoal/keyPoints/CTAをfew-shotとして与える。
- 承認済み内容は `draft_revisions` に snapshot (jsonb) として保存する。RevisionはSeedおよび生成元のSocialDraftに紐づく。Seedの原文は変更しない。
- コスト記録: `ai_generations` テーブルに model / tokens / cost を保存する。
- 制約: 1 Seed → 最大5チャンネル分を並行生成できる。生成結果はRevision作成前に必ずユーザー確認を経る（自動承認しない）。

### PR3 — Scheduling Engine

- `publish_attempts` テーブルを追加し `publish_job_id` に紐づける。失敗理由は `auth` / `ratelimit` / `validation` / `network` に分類する。
- Worker: Supabase Scheduled Edge Function（`pg_cron` → Edge Function）または Vercel Cron → API route（service role使用）のいずれかで実装する。
- `publishMode`（§3）に応じてWorkerの挙動を分岐する: `auto` は即実行、`assisted`/`draft` は承認後にキュー投入、`manual`（note）はWorkerが触れず「手動完了」の記録のみ行う。
- retry / cancel をサポートし、Attempt IDと公開URLを保存、成功時は `published` に遷移する。
- Queue UIで状態遷移（draft → scheduled → published / failed / retry / cancelled）を可視化する。

### PR4 — X + Instagram

- `social_accounts` リポジトリを追加。OAuthトークンは Supabase Vault / pgcrypto で暗号化保存し、リフレッシュ処理を実装する。
- Xアダプタ: API v2、スレッド投稿対応、`linkPlacement: 'none' | 'reply'`、429/レート制限時は指数バックオフで1回リトライ。
- Instagramアダプタ: メディアアップロード → Reelsステータスをポーリング → publish。メディアは公開URL必須（Supabase Storage署名URL）。`content_publishing_limit` を尊重し100 calls/24hを超えないようにする。
- 設定UIにX/Instagramの接続とQueue連携を追加する。

### PR5 — YouTube + TikTok + note handoff（MVP完了ライン）

- YouTubeアダプタ: resumable upload、進捗UI、title/description/tags設定、Shorts判定用の`#Shorts`付与、失敗時はStudioへのリンクにフォールバック。
- TikTokアダプタ: `creator_info` を照会 → `FILE_UPLOAD` → inbox → ステータスポーリング → AIGCラベル付与。
- note handoff: Revisionを note.com向けにフォーマットしたMarkdownへ変換、「コピー」ボタンを提供、`publish_jobs` を `manual-completed` としてマークできるようにする。
- ここまで完了した時点でMVP（§4）が完成する。

### PR6以降（MVP後）

- PR6: Webhook受信（コメント・メンション・DM）、署名検証、重複排除、Unified Inbox
- PR7: 媒体横断のAnalytics、AI提案と人間修正の差分からの学習
- PR8: 公式サイト／作品母艦との統合、SEO
- PR9: 通知、共同承認、モバイル最適化、バックアップ、費用管理

## 6. 最後にまとめて行う本人操作

Claudeや他の自動化が代行できない・すべきでない工程。対応コードと案内画面は先に用意し、本人が最終統合段階でまとめて行う。

**フェーズ1（MVP最小: 1媒体1コネクタ以上で可）**
- 本番Supabaseプロジェクトへのmigration適用と環境変数設定
- Anthropic APIキー発行・予算上限設定
- X: Developer Console登録
- Google Cloud: YouTube Data API有効化・OAuth設定
- Meta: Instagram Business/Creatorアカウント・Facebook連携
- TikTok: Developer登録、sandbox→production昇格申請
- 各SNS OAuthのredirect URL設定

**フェーズ2（MVP後）**
- Meta App ReviewでのAdvanced Access申請、TikTok Content Posting監査、YouTube API監査（数週間かかる想定）
- 必要であればBlotato/Postproxyのような代行プロキシAPIの利用検討（オプション）

## 7. やらない・避けること

- 5媒体すべての完全自動化を最初から同時に完成させようとして基盤と検証を崩す
- 非公式な画面操作や壊れやすいスクレイピングを中核にする
- AIが事実・作品情報・口調・CTAを無断で変更して公開する
- 投稿成功を確認せず、Queue上だけ成功扱いにする
- APIキーやアクセストークンをコード・ログ・GitHubへ露出させる（env / Supabase Vaultのみ）
- 媒体ごとに別の原稿を親データとして持ち、元の意図が分散する
- noteを自動投稿と偽装する（review + copyに留める）
- 派手な分析・課金・汎用SaaS化を、本人用の発信フロー完成より先に優先する

## 8. 実装時の運用ルール（Claude Code向け）

1. PRの順序は本書§5に従う。1PRは最小スコープで完結させる。
2. 完了前に必ず `npm run lint && npm run typecheck && npm test && npm run build` を実行し、すべて成功させる。
3. UI・既存ページフローを壊さない。Phase 2Aで確立した見た目・操作感を維持する。
4. 本書§1・§7の制約を常に優先する。
