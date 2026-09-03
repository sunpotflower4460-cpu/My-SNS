# Creator Hub — My-SNS

A calm, workspace-centric Creator OS for capturing one source Seed, preserving a reusable Brand Profile, preparing channel drafts, triaging inbox activity, and coordinating publishing.

## Phase 2A + PR0-PR5 — MVP complete ✅

The app is now backed by **real Supabase infrastructure** while preserving the existing UI and architecture. PR5 closes out the MVP defined in `docs/master-plan.md` §4: a Seed can flow all the way from one-time capture through AI proposal, human approval, scheduling, and a real connector attempt for all five core channels (X, Instagram, YouTube, TikTok, note) — with the two structural gaps below (media attachment, developer-account setup) intentionally left as the honest, explicitly-documented boundary of what code alone can finish.

## What now works

- **Real Supabase Auth** with magic link email authentication
- **Protected `/app/*` routes** requiring authenticated session
- **Real Postgres database** with all workspace, Seed, Brand Profile, team, inbox, and queue data persisted
- **Private Supabase Storage** for workspace-scoped asset uploads and short-lived previews
- **Multi-workspace** switching with real membership data
- **Row-level security (RLS)** policies protecting all workspace data
- **Seed Library and one-place Seed intake** for source text, files, purpose, audience, key facts, CTA, and five target channels
- **Workspace Brand Profile** kept separate from each Seed, including voice, values, preferred wording, and avoided claims
- **Real AI draft proposals** via `/api/drafts/generate` (Anthropic), with explicit `assumptions` surfaced for every guess and a labeled deterministic template fallback when no API key is configured
- **Immutable Revisions**: approving a draft permanently snapshots what was approved into `draft_revisions`; later Seed or Brand Profile edits cannot change history
- **AI cost/usage tracking** in `ai_generations` (model, token counts, estimated cost)
- **Scheduling Engine**: schedule an approved draft's Revision to the Publish Queue, a Worker (`/api/publish/run`, run on a schedule — see `vercel.json`) executes due `auto`-mode jobs and records a `publish_attempts` history with classified failure reasons; `note` (and any future manual-copy channel) is `publish_mode: 'manual'` and is completed by a human from the Queue instead
- **Real X, Instagram, YouTube, and TikTok connectors**: OAuth connect flow from Settings (`/api/social/{platform}/connect` → `/callback`), tokens encrypted at the application layer before storage (never selectable from the browser — see `social_account_credentials`). In api-first mode, due `auto` jobs (including YouTube and TikTok) run from the scheduled Worker (`/api/publish/run`, daily on Vercel Hobby). Queue **今すぐ公開** remains for immediate/unscheduled jobs (`/api/publish/trigger`). Seed assets resolve to signed media URLs at publish time, including optional YouTube custom thumbnails and Instagram Reel covers. TikTok Direct Post stays `SELF_ONLY` until audit — it auto-runs at T but is not faked as a public post.
- **note handoff**: an approved note Revision is one click away from note.com-ready Markdown (**Copy for note.com** in the Queue) and a **Mark as posted** button records completion — no fake automatic posting, since note has no public posting API.
- **Webhook ingestion + Unified Inbox (PR6)**: Instagram comments and DMs arrive automatically via a signature-verified webhook (`/api/webhooks/meta`); a **Sync inbox** button in Settings pulls YouTube's real channel comments on demand. Every inbound item dedupes on its platform-native id, so a webhook retry or an overlapping manual sync never creates a duplicate row. X and TikTok's own comment/mention/DM sync are honest, permanent gaps (documented below) rather than guessed-at API calls.
- **Analytics + AI learning from corrections (PR7)**: a new Analytics page shows real publish success/failure rates per channel, failure-reason breakdowns, AI cost/usage totals, what fraction of AI proposals humans actually edit before approving, and the recent "AI proposed → you approved" diffs — all derived from `publish_attempts`/`ai_generations`/`draft_revisions`, nothing estimated. Live view/like/comment counts are fetched on demand for YouTube and X (both scope-ready with what's already granted); Instagram/TikTok metrics are documented gaps needing a scope this app doesn't yet request. Every AI-sourced draft freezes an `ai_original_snapshot` as soon as the model proposal is parsed, so a pre-save edit is not baked into "AI original". Approved field-level edits (title/body/hashtags/CTA) become few-shot examples — plus compact, fact-free style notes when the same channel has been corrected more than once — fed into the next `/api/drafts/generate` call. Brand Profile is never auto-overwritten.
- **Notifications, mobile navigation, data export, and an AI budget cap (PR9)**: an in-app notification bell (poll-on-load, not push) tells approvers when a draft needs review, tells the creator + admins when a scheduled publish fails, and tells the team when a teammate flags an inbox item as needing action. Below the `xl` breakpoint — every phone and most tablets — a hamburger menu now opens the same navigation Sidebar shows above it (previously: nothing at all). Settings gains a one-click **Export workspace data** button (Seeds, Brand Profiles, approved Revisions, publish history as a JSON download — no server-side export pipeline, just what's already loaded and RLS-scoped). An optional `ANTHROPIC_MONTHLY_BUDGET_USD` stops new AI generation calls once a workspace's calendar-month spend meets the cap.
- **Dashboard, Seed detail, draft studio, queue, analytics, inbox, team, brand, and settings flows** with real persistence
- **Audit events** logged to database
- **Workspace roles** (owner, admin, editor, contributor, viewer) enforced via RLS

## What is still deferred

- X and TikTok comment/mention/DM sync, and their post metrics — both require API access tiers or app reviews this app's current credentials don't have; see Known limitations
- Instagram post metrics — the Insights API needs a scope (`instagram_manage_insights`) this app does not yet request
- Resolving an Instagram `mentions` webhook to its actual comment text (the payload only carries a pointer, not the text itself)
- Real-time/push notifications (today's are poll-on-load, refreshed the same way every other workspace list is — see Known limitations) and email delivery
- HP/site integration (PR8) — needs the actual site's details before it can be scoped

## Environment setup

### Required environment variables

Create a `.env.local` file in the root directory:

```bash
# Copy from .env.example
cp .env.example .env.local
```

Then set your Supabase credentials:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
SUPABASE_SECRET_KEY=your-service-role-key-here
```

Optionally set `ANTHROPIC_API_KEY` to enable real AI draft proposals (server-only, never sent to the browser). Without it, `/api/drafts/generate` falls back to deterministic templates and says so explicitly in the response — it never presents a template as an AI proposal. See `.env.example` for the full list of AI-related variables (model override, optional cost-per-token for `ai_generations.cost_usd`).

Set `CRON_SECRET` to enable the publish Worker (`/api/publish/run`). Without it, the Worker refuses every request rather than running unauthenticated.

To connect a platform, set `SOCIAL_TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, and that platform's client id/secret (`X_CLIENT_ID`/`X_CLIENT_SECRET`, `META_APP_ID`/`META_APP_SECRET`, `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`, or `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`) — see `.env.example` for details and the exact redirect URIs to register with each platform's developer console. Without these, the "Connect" button in Settings returns a clear "not configured" error rather than attempting anything.

Set `META_WEBHOOK_VERIFY_TOKEN` to enable Instagram's webhook (`/api/webhooks/meta`) — it reuses `META_APP_SECRET` for signature verification. Without it, the webhook route refuses every request rather than accepting unverified payloads.

Optionally set `ANTHROPIC_MONTHLY_BUDGET_USD` to cap AI spend per workspace per calendar month. Unset means no cap. Only meaningful once the cost-per-token vars above are set — with those unset, cost stays 0 and a cap can never be reached.

### Setting up Supabase

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Run the migrations** to create the database schema:
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Run each migration file in order:
     - `supabase/migrations/20260421000000_initial_schema.sql`
     - `supabase/migrations/20260421000001_rls_policies.sql`
     - `supabase/migrations/20260421000002_triggers.sql`
     - `supabase/migrations/20260715000000_private_asset_storage.sql`
     - `supabase/migrations/20260715010000_seed_brand_profile_foundation.sql`
     - `supabase/migrations/20260716000000_ai_draft_generation.sql`
     - `supabase/migrations/20260717000000_scheduling_engine.sql`
     - `supabase/migrations/20260718000000_x_instagram_connectors.sql`
     - `supabase/migrations/20260719000000_publish_job_claims.sql`
     - `supabase/migrations/20260720000000_webhook_inbox.sql`
     - `supabase/migrations/20260721000000_analytics_learning.sql`
     - `supabase/migrations/20260722000000_notifications.sql`
   - `youtube`/`tiktok` were already valid `social_platform` values from the initial schema, and PR4's `social_accounts`/`social_account_credentials`/`oauth_states` tables are already generic across every platform, so PR5's only schema change is the `claimed_at` column above.
3. The PR0 migration makes assets private; the PR1 migration preserves existing rows while promoting `contents` to `seeds` and adding `brand_profiles`; the PR2 migration adds structured proposal fields to `social_drafts` plus the append-only `draft_revisions` and `ai_generations` tables; the PR3 migration adds `publish_mode`/`revision_id` to `publish_jobs`, the append-only `publish_attempts` table, and tightens `publish_jobs` RLS to owner/admin (matching the `manage_queue` permission); the PR4 migration adds `social_account_credentials` (RLS enabled with zero policies — only the service-role key can touch it) and `oauth_states`, and tightens `social_accounts` RLS to owner/admin (matching `manage_social_accounts`); the PR5 migration adds a `claimed_at` column to `publish_jobs`, set atomically while the Worker or a manual "Publish now" is actively processing a job so concurrent attempts and cancels can't race it (a claim older than 10 minutes is treated as abandoned and can be reclaimed); the PR6 migration adds an `external_id` column to `inbox_items` plus a unique index on `(workspace_id, platform, kind, external_id)` (not partial — PostgREST's `.upsert({onConflict})` can't target a partial index, and Postgres already treats distinct NULLs as non-conflicting, so a plain index dedupes external events without constraining internal-only rows), so the same webhook delivery or overlapping manual sync can never create a duplicate inbox row. It also adds a partial unique index on `social_accounts (platform, external_account_id) WHERE connected`, so the same real platform account can never be connected=true in two workspaces at once; the PR7 migration adds an `ai_original_snapshot` column to both `social_drafts` and `draft_revisions` (frozen the moment an AI-sourced draft is first saved, copied into the Revision at approval) and updates `approve_social_draft()` to carry it through — the basis for comparing what the AI proposed against what a human actually approved; the PR9 migration adds the `notifications` table (RLS: read/update only your own rows, but any workspace member can insert one targeting a teammate — the same trust level already given to `inbox_notes` authorship).
4. **Copy your project credentials** to `.env.local`
5. **(Optional) Enable the publish Worker** — if deploying to Vercel, `vercel.json` already schedules `/api/publish/run` once a day at 00:00 UTC (Hobby's maximum cadence; Pro can raise this). Set `CRON_SECRET` in your Vercel project's environment variables (Vercel then sends it automatically as the Worker's `Authorization` header). Each tick processes at most 20 due jobs. Any other host can call the same route on a schedule with `Authorization: Bearer $CRON_SECRET`.
6. **(Optional) Connect X/Instagram/YouTube/TikTok** — register a developer app with each platform (see `.env.example` for the redirect URIs to register), then set the corresponding env vars. This is the one part of PR4/PR5 that genuinely needs the human: developer account creation and app review are outside what any code change can do.
7. **(Optional) Subscribe Instagram's webhook** — in the Meta App Dashboard's Webhooks product, subscribe `$NEXT_PUBLIC_APP_URL/api/webhooks/meta` for the `instagram` object, fields `comments` and `messages`, using the same value you set for `META_WEBHOOK_VERIFY_TOKEN` as the Verify Token. Comments and DMs then arrive in the Unified Inbox automatically.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Sign in

1. Go to http://localhost:3000/login
2. Enter your email address
3. Check your email for the magic link
4. Click the link to sign in

On first sign in, the app will automatically:
- Create your profile
- You can then create a workspace from the app

## Project architecture

```text
src/
  app/
    providers.tsx              Auth + App provider composition
    login/page.tsx             Magic link auth flow
    app/                       Protected app routes
    api/drafts/generate/       Server-only AI draft generation route
    api/publish/run/           Server-only scheduled publish Worker (CRON_SECRET-gated, publish_mode='auto')
    api/publish/trigger/       Manual "Publish now" for due or immediate API-first jobs (including YouTube/TikTok)
    api/social/[platform]/     OAuth connect + callback routes (x, instagram, youtube, tiktok)
    api/social/disconnect/     Deletes stored credentials (service-role only)
    api/webhooks/meta/         Instagram webhook receiver (signature-verified, service-role)
    api/inbox/sync/            Manual pull sync for platforms with no webhook (currently: YouTube)
    api/analytics/metrics/     Live, on-demand post metrics lookup (read-only, view_queue-gated)
  components/
    layout/                    Sidebar (xl+), MobileNav (below xl), TopBar + NotificationBell, workspace switcher
    ui/                        Shared presentation components
  hooks/
    useCurrentUser.ts          Session hook
  lib/
    auth/                      Supabase Auth provider
    app/                       App provider with Supabase repositories
    crypto/                    AES-256-GCM OAuth token cipher (server-only)
    repositories/supabase/     Seed, Brand Profile, Draft/Revision, Queue/Attempt, AI generation, social account/credential, inbox-ingest, notifications, and workspace repositories
    storage/supabase/          Supabase Storage adapter
    supabase/                  Supabase client setup (browser, server, and service-role for the Worker/OAuth callback/webhook)
    domain/                    Shared domain types
    services/                  Template drafts, Anthropic-backed drafts (style-learning aware: generation-time snapshot, field-level few-shot corrections, fact-free tendencies), the shared publish-attempt/failure-classification logic, real X/Instagram/YouTube/TikTok connector adapters (including live metrics fetch), note-to-Markdown formatting, Meta webhook signature verification + payload mapping (all server-only where relevant), and the fail-closed stub for every other platform
```

## Database schema

The app uses the following main tables:
- **profiles** - User profiles linked to Supabase Auth
- **workspaces** - Workspace records with ownership
- **workspace_members** - Membership records with roles
- **workspace_invitations** - Pending invitations
- **seeds** - Raw source inputs captured once before channel adaptation
- **brand_profiles** - Reusable voice, audience, values, and wording boundaries
- **assets** - Private asset metadata linked to Seeds
- **social_drafts** - Channel-specific draft variations (title, hashtags, CTA, assumptions, channel-specific metadata, source); AI-sourced drafts also carry a frozen `ai_original_snapshot` set once on first save
- **draft_revisions** - Append-only, immutable snapshot of each approved draft; carries its own copy of `ai_original_snapshot` so the Analytics page and future generation calls can see what a human actually changed
- **ai_generations** - Model, token counts, and estimated cost for each real AI generation call
- **publish_jobs** - Publishing queue; each job carries a `publish_mode` (`auto`/`manual`/`owned`/...) and points at the exact `draft_revisions` snapshot it publishes
- **publish_attempts** - Append-only attempt history per job, with a classified `failure_reason` (`auth`/`ratelimit`/`validation`/`network`/`unavailable`) for failed attempts
- **social_accounts** - Which platform accounts are connected (handle, external id) — no tokens; readable by workspace members
- **social_account_credentials** - Encrypted OAuth tokens. RLS is enabled with **zero policies**: only the service-role key (the OAuth callback route and the Worker) can read or write this table
- **oauth_states** - Short-lived CSRF/PKCE state for one connect attempt; deleted the moment the callback consumes it
- **inbox_items** - Comments, mentions, DMs, and replies — internal notes plus, as of PR6, real Instagram webhook deliveries and YouTube pull-synced comments; `external_id` + a unique index dedupe the same platform event across retries/overlapping syncs
- **inbox_notes** - Internal notes on inbox items
- **notifications** - Per-user, per-workspace in-app notifications (draft needs approval, publish failed, inbox item needs action); poll-on-load like everything else in this app, not push
- **audit_logs** - Activity audit trail

All tables have Row-Level Security (RLS) enabled with workspace-scoped policies. `social_account_credentials` is the one exception with no policies at all — that's intentional, not an oversight (see above).

## Workspace roles

- **Owner** - Full control, can transfer ownership
- **Admin** - Can manage members, settings, Brand Profiles, and all Seeds
- **Editor** - Can manage Seeds, Brand Profiles, and draft approval
- **Contributor** - Can capture and edit their own Seeds
- **Viewer** - Read-only access

## Commands

```bash
# Development
npm run dev

# Linting
npm run lint

# Type and unit checks
npm run typecheck
npm test

# Production build
npm run build
npm run start
```

## What changed from Phase 1

### Before (Phase 1)
- Mock session with seeded users in localStorage
- Mock data repositories with in-memory state
- Mock asset storage with local previews
- No real persistence beyond localStorage

### After (Phase 2A)
- **Supabase Auth** with magic link email authentication
- **Supabase Postgres** with full schema and RLS policies
- **Private Supabase Storage** for real, workspace-scoped file uploads
- **Real repositories** backed by database queries
- **Session managed** via Supabase Auth cookies
- **Audit logging** persisted to database

The UI, component structure, and page flows remain **unchanged** to preserve the existing product experience.

## Migration notes

All core flows now persist to Supabase:
- Workspace creation and switching
- Team member management
- Seed capture and editing
- Brand Profile editing
- Draft generation and management
- Queue operations
- Inbox triage and notes
- Settings updates

The **mock session provider** has been replaced by **Supabase Auth provider**.

The **mock app provider** has been replaced by **Supabase app provider** that loads real data from the database.

## Next steps

MVP (`docs/master-plan.md` §4) is code-complete as of PR5. What's left is either genuinely deferred to a later phase, or is the "本人操作" (human-only setup) boundary described in that document's §6:

1. ~~**PR2** — structured AI proposals, missing-information suggestions, and explicit approval~~ ✅
2. ~~**PR3** — scheduling engine (`publish_attempts`, Worker, retry/cancel, Queue state UI)~~ ✅
3. ~~**PR4** — X and Instagram adapters~~ ✅
4. ~~**PR5** — YouTube and TikTok adapters plus note review/copy handoff~~ ✅
5. ~~**PR6** — Webhook ingestion (Instagram) + Unified Inbox (manual sync for the rest)~~ ✅ (post-MVP; X/TikTok comment sync remain honest gaps — see Known limitations)
6. ~~**PR7** — Analytics (real publish/AI-cost/edit-rate stats, live YouTube/X metrics) + AI learning from human edit diffs~~ ✅ (post-MVP; Instagram/TikTok metrics remain honest gaps — see Known limitations)
7. ~~**PR9** — notifications, mobile navigation, workspace data export, AI budget cap~~ ✅ (post-MVP; notifications are poll-on-load, not push — see Known limitations)
8. **PR8** — HP/site integration (post-MVP; needs the actual site's details before it can be scoped — see `docs/master-plan.md` §5)

`note` is modeled as a publishing channel but remains manual review + copy because there is no supported public posting API in scope.

## Known limitations

- YouTube scheduled jobs upload as **public at T via the Worker** (not left private). Native `status.publishAt` is not used, because that would create the video at schedule time rather than at T and complicate cancel. Cron is daily on Vercel Hobby (`vercel.json`), so the actual send can land up to ~24 hours after T. Use Queue **今すぐ公開** for an immediate run. Each tick processes at most 20 due jobs.
- Custom YouTube thumbnails call `thumbnails.set` after a successful upload. Official docs list `youtube.upload`, but in practice a write scope that can edit the video is safer — OAuth now also requests `youtube.force-ssl`. Already-connected YouTube accounts must **reconnect from Settings**. Missing thumbnail files or missing scopes fail closed before upload; a thumbnail failure after the video exists is `PARTIAL_EXTERNAL_SUCCESS` (no automatic retry). Draft generate / Seed media automatically burns 3–8 character Japanese hook text onto 2–3 real 1280×720 stills (`media_role: thumbnail`); `thumbnailTextIdeas` is never treated as a file.
- TikTok Direct Post is limited to `SELF_ONLY` visibility until this app passes TikTok's Content Posting API audit. The Worker **does** auto-run at T, but does not pretend the post is public. Custom cover images are not supported by the API (frame timestamp only).
- Instagram Reels can attach `cover_url` when a still is chosen. A single Facebook login still picks the first Page with a linked IG account; connect another IG account with a separate OAuth to target a second one.
- A workspace may connect more than one account per platform. `publish_jobs.social_account_id` records the target. Two connected accounts and no selection fail closed. The webhook invariant remains: one real LINE/Instagram account cannot be `connected=true` in two workspaces.
- 9:16 vs 16:9: Seed media can detect aspect, auto-assign channels, and crop/export a variant in the browser (often WebM). Serverless ffmpeg is not used. A landscape file is never treated as a Short.
- X requires a **confidential** OAuth 2.0 client (client secret) in the X developer portal, not a public/PKCE-only client
- AI draft generation requires `ANTHROPIC_API_KEY`; without it, `/api/drafts/generate` returns clearly labeled deterministic templates instead
- **Instagram `mentions` sync is not implemented.** Meta's mentions webhook field only carries a media_id/comment_id pointer, not the comment text itself — resolving it needs an extra Graph API call this app does not make yet. Comments and DMs (`fetchComments`/`fetchMessages`/the webhook) work; mentions fail closed with a clear reason.
- **X and TikTok have no comment/mention/DM sync at all**, by design rather than oversight: X's v2 read endpoints and Account Activity API webhooks require a paid API tier this app does not request (it only asks for the free-tier write scopes needed to publish); TikTok's Content Posting API scope doesn't include reading engagement data, and its separate Display API needs an application review this app hasn't completed. Both fail closed with the specific reason rather than silently returning nothing.
- YouTube inbox sync is pull-only (a **Sync inbox** button in Settings, or `POST /api/inbox/sync`) — there is no YouTube webhook for comments, so nothing arrives automatically the way Instagram's does
- The publish Worker requires `CRON_SECRET` and a scheduled trigger calling it (Vercel Cron via `vercel.json`, or any other host on the same schedule/auth contract)
- The Instagram webhook (`/api/webhooks/meta`) requires `META_WEBHOOK_VERIFY_TOKEN` set and the URL subscribed in the Meta App Dashboard; until then it fails closed (503) rather than accepting unverified payloads
- **Instagram and TikTok post metrics are not available.** Instagram's Insights API needs the `instagram_manage_insights` scope, which this app does not request (adding it means every connected account must reconnect); TikTok's engagement data needs its separate Display API, which needs an application review this app hasn't completed. Both fail closed on the Analytics page's "Load metrics" action with the specific reason.
- **AI style learning remembers approved corrections, not Brand Profile rewrites.** `ai_original_snapshot` is frozen when the proposal is parsed, then persisted on first save so a pre-save edit does not pollute the "AI original" side. If a client does not pass that generation-time copy, the first-save content is still the fallback. The snapshot is the app's normalized proposal (not the raw model JSON). Unedited approvals are not used as examples. Tendencies (shorten body, fewer hashtags, …) are derived only when the same channel has at least two corrections, and they never copy facts from a past Seed or overwrite Brand Profile.
- Analytics metrics are fetched live and never cached/stored — the "Load metrics" button makes a real API call every time it's clicked; there is no background refresh or historical trend chart
- **Notifications are poll-on-load, not real-time push.** There is no Supabase Realtime subscription anywhere in this app — a new notification appears the next time `refreshWorkspaceData()` runs (page load, workspace switch, or right after your own next action), the same cadence every other list in this app already uses. A teammate's publish failure at 3am is not pushed to anyone; it's there next time someone opens the app.
- **"Co-approval" means notification fan-out, not dual sign-off.** Every teammate who can approve drafts is notified when one needs review, and any one of them can still approve solo — there is no second-approver requirement. This was a deliberate scoping choice for PR9's one-line "共同承認" spec (see `docs/master-plan.md` §5), not a partial implementation of something stricter.
- The AI budget cap can only block the *next* generation call once a workspace's spend already meets `ANTHROPIC_MONTHLY_BUDGET_USD` — it cannot know or limit one specific call's cost before making it, since Anthropic only reports token usage after a call completes

## Security

- All routes under `/app/*` require authentication
- All database queries are protected by RLS policies
- Workspace members can only access their own workspace data
- Write operations respect role-based permissions
- Asset uploads are scoped to workspace storage paths
- The `assets` bucket is private; UI previews use one-hour signed URLs
- Security-definer database helpers use a pinned search path
- OAuth access/refresh tokens are encrypted (AES-256-GCM) before storage; the table holding them has no client-facing RLS policy at all, so only server code using the service-role key can ever read one
- The Instagram webhook verifies Meta's `X-Hub-Signature-256` header (HMAC-SHA256 over the raw request body, keyed by `META_APP_SECRET`, compared with a timing-safe check) before processing any payload; an invalid or missing signature is rejected with 401 and never reaches the ingestion path
- `notifications` RLS: any workspace member can INSERT a row targeting any other member of the *same* workspace (needed to notify a teammate — self-scoped INSERT can't express that), but SELECT/UPDATE are strictly `user_id = auth.uid()`, so a notification can only ever be read or marked-read by its actual recipient

## Support

This is an internal prototype. For questions or issues, check the docs/ folder or contact the team.
