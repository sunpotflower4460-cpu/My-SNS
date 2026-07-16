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

## 現在地（更新: 2026-07-16）

- PR0: Supabase基盤の正常化 — マージ済み
- PR1: Seed / Brand Profile 基盤 — マージ済み
- 次: PR2 AI提案＋承認 → PR3 Scheduling Engine → PR4 X＋Instagram → PR5 YouTube＋TikTok＋note handoff（ここまででMVP完成）

## 最後にまとめて行う本人操作

以下はコードと案内画面を先に用意し、最終統合段階でまとめて行う。本人以外（Claude含む）が代行できない、あるいは代行すべきでない操作である。

- 本番Supabaseプロジェクトへのmigration適用と環境変数設定
- AIプロバイダーのAPIキー発行・予算設定
- X (Developer Console)、Google Cloud (YouTube Data API/OAuth)、Meta (Instagram Business/Creator連携)、TikTok (Developer account) の開発者登録
- 各SNS OAuthのredirect URL・審査申請
- 実アカウントでの接続承認とテスト投稿
