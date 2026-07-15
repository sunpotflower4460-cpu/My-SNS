# Creator Hub — My-SNS

A calm, workspace-centric Creator OS for capturing one source Seed, preserving a reusable Brand Profile, preparing channel drafts, triaging inbox activity, and coordinating publishing.

## Phase 2A + PR0 + PR1 foundation ✅

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
- **Dashboard, Seed detail, draft studio, queue, inbox, team, brand, and settings flows** with real persistence
- **Audit events** logged to database
- **Workspace roles** (owner, admin, editor, contributor, viewer) enforced via RLS

## What is still deferred

- Real social platform connectors (Instagram, Threads, X, TikTok, YouTube)
- Webhook ingestion from social platforms
- Background publishing jobs and workers
- Advanced notifications
- Real AI provider integration
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
3. The PR0 migration makes assets private; the PR1 migration preserves existing rows while promoting `contents` to `seeds` and adding `brand_profiles`.
4. **Copy your project credentials** to `.env.local`

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
  components/
    layout/                    Sidebar, top bar, workspace switcher
    ui/                        Shared presentation components
  hooks/
    useCurrentUser.ts          Session hook
  lib/
    auth/                      Supabase Auth provider
    app/                       App provider with Supabase repositories
    repositories/supabase/     Seed, Brand Profile, and workspace repositories
    storage/supabase/          Supabase Storage adapter
    supabase/                  Supabase client setup
    domain/                    Shared domain types
    services/                  Transparent channel templates + disabled connector seams
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
- **social_drafts** - Channel-specific draft variations
- **publish_jobs** - Publishing queue
- **inbox_items** - Inbox messages (internal for now)
- **inbox_notes** - Internal notes on inbox items
- **audit_logs** - Activity audit trail

All tables have Row-Level Security (RLS) enabled with workspace-scoped policies.

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

1. **PR2** — structured AI proposals, missing-information suggestions, and explicit approval
2. **PR3** — scheduling rules, immutable approved revisions, and worker seams
3. **PR4** — X and Instagram adapters
4. **PR5** — YouTube and TikTok adapters plus note review/copy handoff

`note` is modeled as a publishing channel but remains manual review + copy because there is no supported public posting API in scope.

## Known limitations

- Social connectors are placeholder (no real OAuth or posting yet)
- Draft generation is a clearly labeled deterministic template preview (no AI provider yet)
- Inbox syncing is internal only (no external platform messages yet)
- Publishing is queued but not executed by background workers yet

## Security

- All routes under `/app/*` require authentication
- All database queries are protected by RLS policies
- Workspace members can only access their own workspace data
- Write operations respect role-based permissions
- Asset uploads are scoped to workspace storage paths
- The `assets` bucket is private; UI previews use one-hour signed URLs
- Security-definer database helpers use a pinned search path

## Support

This is an internal prototype. For questions or issues, check the docs/ folder or contact the team.
