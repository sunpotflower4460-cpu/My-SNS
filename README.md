# Creator Hub — My-SNS

A calm, workspace-centric creator home hub for content planning, draft generation, inbox triage, queue management, and lightweight team collaboration.

## What currently works

- Next.js App Router app shell with protected `/app/*` routes
- mock sign-in flow with seeded users
- multi-workspace switching with workspace-aware data
- dashboard, content library, content detail editing, draft studio, queue, inbox, team, and settings flows
- local persistence for session, active workspace, and prototype data changes
- audit events for major local actions
- lightweight asset attachment previews for new content

## What is still mock

- authentication
- database persistence
- file uploads/storage
- social platform connectors
- invitation acceptance
- background publishing jobs

## Workspace switching

- Each seeded user belongs to one or more workspaces from `src/lib/mock/seed.ts`.
- The workspace switcher changes the active prototype scope for content, inbox, queue, drafts, team, and settings.
- The selected workspace is preserved in local state and safely reset if it becomes stale.
- The switcher now shows the current user role per workspace.

## Mock auth

- `/login` lets you choose a seeded user or sign in by seeded email.
- The selected user ID is stored locally and restored client-side.
- Invalid or stale saved session values are cleared safely.
- The app shell redirects signed-out users back to `/login`.

## Local persistence

- Prototype app data is stored in `localStorage`.
- Session state is handled in `src/lib/session/*`.
- Mock app persistence is handled in `src/lib/mock/store/persistence.ts`.
- If stored prototype data is malformed, the app falls back to fresh seed data instead of crashing.

## Architecture overview

```text
src/
  app/
    providers.tsx
    login/page.tsx
    app/                         Protected app routes
  components/
    layout/                      Sidebar, top bar, workspace switcher
    ui/                          Shared presentation components
  hooks/
    useCurrentUser.ts
    useCurrentWorkspace.ts
  lib/
    audit/                       Audit log presentation helpers
    domain/                      Shared domain types
    mock/
      repositories/             Mock repository implementations
      seed.ts                   Seed data only
      store/                    App-layer façade and persistence
    session/                    Session abstraction + mock provider
    storage/                    Prototype asset storage seam
    services/                   AI draft + social connector seams
```

## Phase 2 connection points

- Auth seam: `src/lib/session/interfaces.ts` and `src/hooks/useCurrentUser.ts`
- Data seam: `src/lib/mock/store/provider.tsx` over `src/lib/mock/repositories/*`
- Storage seam: `src/lib/storage/interfaces.ts`
- Connector seam: `src/lib/services/interfaces.ts` and `src/lib/services/social-connector.ts`

See also:

- `docs/phase-2-plan.md`
- `docs/backend-mapping.md`
- `docs/migration-seams.md`

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

Useful commands:

```bash
npm run lint
npm run build
```

## Known limitations

- Everything is client-side and mock-backed
- Clearing browser storage resets prototype state
- Social publishing and inbox syncing are simulated
- File attachments only prepare local preview metadata
- Permissions are UX-level only and not enforced by a real backend yet
