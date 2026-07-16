# Creator Hub — My-SNS

A calm, workspace-centric Creator OS for capturing one source Seed, preserving a reusable Brand Profile, preparing channel drafts, triaging inbox activity, and coordinating publishing.

## Phase 2A + PR0 + PR1 + PR2 + PR3 + PR4 foundation ✅

The app is now backed by **real Supabase infrastructure** while preserving the existing UI and architecture.

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
- **Real X and Instagram connectors**: OAuth 2.0 connect flow from Settings (`/api/social/{platform}/connect` → `/callback`), tokens encrypted at the application layer before storage (never selectable from the browser — see `social_account_credentials`), the Worker publishes through them with automatic token refresh. Instagram publishing needs a media URL the app doesn't attach yet (drafts are still text-only) and fails closed with a clear message until that's built.
- **Dashboard, Seed detail, draft studio, queue, inbox, team, brand, and settings flows** with real persistence
- **Audit events** logged to database
- **Workspace roles** (owner, admin, editor, contributor, viewer) enforced via RLS

## What is still deferred

- YouTube and TikTok connectors, and the note review/copy handoff (PR5)
- Attaching media (image/video) to a draft/Revision — Instagram (and PR5's YouTube/TikTok) need this to actually publish
- Webhook ingestion from social platforms
- Advanced notifications
- Billing/usage metering
- Deep analytics dashboards

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

To connect X or Instagram, set `SOCIAL_TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, and the relevant `X_CLIENT_ID`/`X_CLIENT_SECRET` or `META_APP_ID`/`META_APP_SECRET` — see `.env.example` for details and the exact redirect URIs to register with each platform's developer console. Without these, the "Connect" button in Settings returns a clear "not configured" error rather than attempting anything.

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
3. The PR0 migration makes assets private; the PR1 migration preserves existing rows while promoting `contents` to `seeds` and adding `brand_profiles`; the PR2 migration adds structured proposal fields to `social_drafts` plus the append-only `draft_revisions` and `ai_generations` tables; the PR3 migration adds `publish_mode`/`revision_id` to `publish_jobs`, the append-only `publish_attempts` table, and tightens `publish_jobs` RLS to owner/admin (matching the `manage_queue` permission); the PR4 migration adds `social_account_credentials` (RLS enabled with zero policies — only the service-role key can touch it) and `oauth_states`, and tightens `social_accounts` RLS to owner/admin (matching `manage_social_accounts`).
4. **Copy your project credentials** to `.env.local`
5. **(Optional) Enable the publish Worker** — if deploying to Vercel, `vercel.json` already schedules `/api/publish/run` every 5 minutes; set `CRON_SECRET` in your Vercel project's environment variables (Vercel then sends it automatically as the Worker's `Authorization` header). Any other host can call the same route on a schedule with `Authorization: Bearer $CRON_SECRET`.
6. **(Optional) Connect X/Instagram** — register a developer app with each platform (see `.env.example` for the redirect URIs to register), then set the corresponding env vars. This is the one part of PR4 that genuinely needs the human: developer account creation and app review are outside what any code change can do.

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
    api/publish/run/           Server-only publish Worker route (CRON_SECRET-gated)
    api/social/[platform]/     OAuth connect + callback routes (x, instagram)
    api/social/disconnect/     Deletes stored credentials (service-role only)
  components/
    layout/                    Sidebar, top bar, workspace switcher
    ui/                        Shared presentation components
  hooks/
    useCurrentUser.ts          Session hook
  lib/
    auth/                      Supabase Auth provider
    app/                       App provider with Supabase repositories
    crypto/                    AES-256-GCM OAuth token cipher (server-only)
    repositories/supabase/     Seed, Brand Profile, Draft/Revision, Queue/Attempt, social account/credential, and workspace repositories
    storage/supabase/          Supabase Storage adapter
    supabase/                  Supabase client setup (browser, server, and service-role for the Worker/OAuth callback)
    domain/                    Shared domain types
    services/                  Template drafts, Anthropic-backed drafts, the publish Worker's failure classifier, real X/Instagram connector adapters (all server-only where relevant), and the fail-closed stub for every other platform
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
- **social_drafts** - Channel-specific draft variations (title, hashtags, CTA, assumptions, channel-specific metadata, source)
- **draft_revisions** - Append-only, immutable snapshot of each approved draft
- **ai_generations** - Model, token counts, and estimated cost for each real AI generation call
- **publish_jobs** - Publishing queue; each job carries a `publish_mode` (`auto`/`manual`/`owned`/...) and points at the exact `draft_revisions` snapshot it publishes
- **publish_attempts** - Append-only attempt history per job, with a classified `failure_reason` (`auth`/`ratelimit`/`validation`/`network`/`unavailable`) for failed attempts
- **social_accounts** - Which platform accounts are connected (handle, external id) — no tokens; readable by workspace members
- **social_account_credentials** - Encrypted OAuth tokens. RLS is enabled with **zero policies**: only the service-role key (the OAuth callback route and the Worker) can read or write this table
- **oauth_states** - Short-lived CSRF/PKCE state for one connect attempt; deleted the moment the callback consumes it
- **inbox_items** - Inbox messages (internal for now)
- **inbox_notes** - Internal notes on inbox items
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

The delivery order intentionally leaves manual provider setup until the integration code is ready:

1. ~~**PR2** — structured AI proposals, missing-information suggestions, and explicit approval~~ ✅
2. ~~**PR3** — scheduling engine (`publish_attempts`, Worker, retry/cancel, Queue state UI)~~ ✅
3. ~~**PR4** — X and Instagram adapters~~ ✅ (Instagram publishing still needs media attachment support — see Known limitations)
4. **PR5** — YouTube and TikTok adapters plus note review/copy handoff

`note` is modeled as a publishing channel but remains manual review + copy because there is no supported public posting API in scope.

## Known limitations

- YouTube and TikTok connectors don't exist yet (PR5) — the Worker attempts them and fails closed with reason `unavailable`
- Instagram is connectable, but publishing requires a media URL that no PR has wired up yet (drafts/Revisions are text-only through PR4) — it fails closed with a clear validation error rather than attempting a broken request
- The Instagram connector picks the first Facebook Page with a linked Instagram Business/Creator account; it can't yet choose among multiple linked Pages
- X requires a **confidential** OAuth 2.0 client (client secret) in the X developer portal, not a public/PKCE-only client
- AI draft generation requires `ANTHROPIC_API_KEY`; without it, `/api/drafts/generate` returns clearly labeled deterministic templates instead
- Inbox syncing is internal only (no external platform messages yet) — `fetchInbox`/`fetchComments`/`fetchMentions`/`fetchMessages` are implemented as explicit "not yet" errors on both connectors, reserved for PR6
- The publish Worker requires `CRON_SECRET` and a scheduled trigger calling it (Vercel Cron via `vercel.json`, or any other host on the same schedule/auth contract)

## Security

- All routes under `/app/*` require authentication
- All database queries are protected by RLS policies
- Workspace members can only access their own workspace data
- Write operations respect role-based permissions
- Asset uploads are scoped to workspace storage paths
- The `assets` bucket is private; UI previews use one-hour signed URLs
- Security-definer database helpers use a pinned search path
- OAuth access/refresh tokens are encrypted (AES-256-GCM) before storage; the table holding them has no client-facing RLS policy at all, so only server code using the service-role key can ever read one

## Support

This is an internal prototype. For questions or issues, check the docs/ folder or contact the team.
