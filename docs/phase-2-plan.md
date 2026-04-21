# Phase 2 plan

## Phase 2A Status: ✅ COMPLETE

All Phase 2A objectives have been successfully implemented.

## Goal

Replace prototype-only auth, persistence, and integrations with real Supabase-backed infrastructure without rewriting page flows.

## Phase 2A: Completed ✅

### 1. Auth migration ✅
- ✅ Replaced mock session with Supabase Auth
- ✅ Implemented magic link email authentication
- ✅ Updated `useCurrentUser()` to use Supabase Auth provider
- ✅ Protected `/app/*` routes with real authentication
- ✅ Session managed via Supabase Auth cookies with automatic refresh

### 2. Database persistence ✅
- ✅ Created full database schema with migrations
- ✅ Implemented Row-Level Security (RLS) policies for all tables
- ✅ Created Supabase-backed repositories for all core entities:
  - workspaces
  - workspace_members
  - contents
  - social_drafts
  - publish_jobs
  - inbox_items
  - audit_logs
- ✅ Replaced mock app provider with Supabase app provider
- ✅ All page components now use real database persistence

### 3. Asset storage ✅
- ✅ Implemented Supabase Storage adapter
- ✅ Real file uploads to workspace-scoped storage paths
- ✅ Asset metadata persisted to database
- ✅ Asset preview support for images

### 4. Workspace architecture ✅
- ✅ Multi-workspace support with real memberships
- ✅ Workspace roles enforced via RLS (owner, admin, editor, contributor, viewer)
- ✅ Workspace switching persists and validates against DB
- ✅ All data queries are workspace-scoped

### 5. Migration without UI changes ✅
- ✅ Preserved all existing page flows
- ✅ Maintained component architecture
- ✅ Kept domain types as shared contract
- ✅ UI/UX unchanged

## Implementation summary

### Files added
- `src/lib/supabase/` - Supabase client setup (browser, server, middleware)
- `src/lib/auth/auth-provider.tsx` - Supabase Auth provider
- `src/lib/app/app-provider.tsx` - Supabase-backed app provider
- `src/lib/repositories/supabase/` - Database repositories
- `src/lib/storage/supabase/` - Storage adapter
- `supabase/migrations/` - Database schema and RLS policies
- `src/middleware.ts` - Session refresh middleware
- `.env.example` - Environment variable template

### Files modified
- `src/app/providers.tsx` - Use new auth and app providers
- `src/app/login/page.tsx` - Magic link authentication
- `src/hooks/useCurrentUser.ts` - Use Supabase Auth
- `src/app/app/layout.tsx` - Use new providers
- All page files - Import from new app provider
- `README.md` - Updated documentation
- `package.json` - Added Supabase dependencies

## What still uses mocks
- AI draft generation (no real LLM provider yet)
- Social platform connectors (OAuth and posting)
- Background publishing workers
- Webhook ingestion

## Phase 2B: Next steps

Future phases will implement:

### 1. Real social connectors
- OAuth flows for each platform (Instagram, Threads, X, TikTok, YouTube)
- Real API integration for posting
- Account connection management
- Token refresh and error handling

### 2. Background workers
- Publishing job processor
- Retry logic for failed posts
- Scheduled publishing
- Job status tracking

### 3. Webhook ingestion
- Endpoint setup for each platform
- Signature verification
- Event processing
- Inbox population from external messages

### 4. AI provider integration
- LLM API integration (e.g., OpenAI, Anthropic)
- Real draft generation
- Tone and length variations
- Cost tracking

### 5. Advanced features
- Billing and usage metering
- Analytics dashboards
- Advanced notifications
- Invitation email flows
- Team activity feeds

## Minimal migration strategy (used)

- ✅ Kept page components calling hooks and app-layer methods
- ✅ Swapped provider internals without changing page UX
- ✅ Preserved current domain types as the shared contract
- ✅ Introduced async repository boundaries at the app provider level

## Security implementation ✅

- ✅ All tables have RLS enabled
- ✅ Workspace-scoped read policies
- ✅ Role-based write policies
- ✅ Helper functions for permission checks
- ✅ Auto-profile creation on user sign-up
- ✅ Auto-membership creation for workspace owners

## Key architectural decisions

1. **Async app provider** - App provider methods are now async, reflecting database queries
2. **Maintained hook interface** - `useMockApp()` and related hooks maintain same signatures for compatibility
3. **Repository pattern** - Clean separation between app logic and database queries
4. **RLS first** - Security enforced at database level, not application level
5. **Storage abstraction** - Asset storage behind clean interface for future flexibility

## Migration verification checklist ✅

- ✅ Supabase auth replaces mock auth for app access
- ✅ `/app/*` requires real session
- ✅ Real DB schema/migrations exist
- ✅ Workspace/member/content flows use real persistence
- ✅ Asset upload uses Supabase Storage
- ✅ Repository boundaries remain clean
- ✅ Inbox/drafts/audit are DB-backed
- ✅ UI still feels coherent
- ✅ README/docs are updated
- ✅ External social integrations are cleanly deferred

## Known limitations after Phase 2A

- **No real social posting** - Social connector implementations are still placeholder
- **No real AI generation** - Draft generation uses mock responses
- **No external inbox** - Inbox items are internal only, no platform syncing
- **No background jobs** - Publishing jobs are queued but not executed by workers
- **No invitation emails** - Invitation records created but emails not sent

These limitations are intentional and will be addressed in Phase 2B and beyond.
