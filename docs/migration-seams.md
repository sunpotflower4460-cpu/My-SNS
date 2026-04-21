# Migration seams

## Auth provider boundary

- Current seam:
  - `src/hooks/useCurrentUser.ts`
  - `src/lib/session/interfaces.ts`
  - `src/lib/session/mock-session.tsx`
- Phase 2 direction:
  - keep the hook surface
  - replace the mock provider internals with Supabase session and profile loading

## Data repository boundary

- Current seam:
  - `src/lib/mock/store/provider.tsx` is the application façade
  - `src/lib/mock/repositories/*` contain data access and mutation rules
  - page files do not import raw seed data
- Phase 2 direction:
  - replace each mock repository with Supabase-backed implementations
  - keep workspace-aware method signatures

## Storage boundary

- Current seam:
  - `src/lib/storage/interfaces.ts`
  - `src/lib/storage/mock-asset-storage.ts`
  - `src/app/app/content/new/page.tsx`
- Current behavior:
  - prepares lightweight asset metadata and optional image previews locally
- Phase 2 direction:
  - upload files to Supabase Storage
  - save returned object paths in the `assets` table

## Connector boundary

- Current seam:
  - `src/lib/services/interfaces.ts`
  - `src/lib/services/social-connector.ts`
- Phase 2 direction:
  - add real per-platform OAuth/token handling
  - map publish and inbox sync calls to connector implementations

## Local persistence boundary

- Current seam:
  - `src/lib/mock/store/persistence.ts`
  - `src/lib/session/persistence.ts`
- Current behavior:
  - keeps prototype edits and session selections in browser `localStorage`
  - safely falls back when stored state is stale or malformed
- Phase 2 direction:
  - remove prototype persistence once real auth and database persistence are live
  - keep domain logic and page behavior unchanged where possible

## Open priorities

1. Real auth
2. Database persistence
3. Real asset storage
4. First social connector
