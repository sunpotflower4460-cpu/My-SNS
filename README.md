# Creator Hub — My-SNS

A workspace-centric creator home hub for managing content, social drafts, publishing queues, inbox activity, and team collaboration.

## Current phase

This repo now delivers a stronger Phase 0 / Phase 1 prototype with:

- Next.js 15 App Router + React 19 + TypeScript + Tailwind CSS 3
- a lightweight mock auth/session flow for `/app/*`
- multi-workspace switching with local persistence
- a mock repository/store layer backed by seed data
- locally persistent updates for content, team, inbox, queue, drafts, and settings
- audit logging for major mock actions

The app is still mock-first and intentionally easy to swap to real Supabase-backed auth/data later.

## What works today

### Mock auth-ready flow

- `/app/*` is protected by a client-side mock session guard
- `/login` lets you sign in as one of the seeded users or by entering a seeded email
- mock session state is stored in localStorage
- logout is available from the app shell

### Multi-workspace flow

- seed data now includes multiple workspaces
- the active workspace switcher is functional
- workspace selection is persisted in localStorage
- dashboard, content, inbox, queue, team, drafts, and settings all read from the active workspace

### Mock repositories + local persistence

Seed data still lives in `src/lib/mock/seed.ts`, but page components now read through the mock session/store layer instead of importing raw seed constants directly.

Key additions:

- `src/lib/session/mock-session.tsx`
- `src/lib/mock/store/*`
- `src/lib/mock/repositories/*`
- `src/hooks/useCurrentUser.ts`
- `src/hooks/useCurrentWorkspace.ts`

### Interactive prototype behavior

- Team invites create pending invitations in local mock state
- Team role changes and removals update local state with owner/self protection in UI
- New Content saves to the mock repository and routes to the new detail page
- New Content supports lightweight local asset attachment with metadata previews
- Content detail loads repository-backed content, assets, drafts, queue items, inbox items, and audit history
- Inbox supports read/unread, star, needs-action, and internal note updates
- Queue retry/cancel updates local job state
- Draft Studio generation, regenerate, approve, and save all feel stateful
- Workspace settings save into local mock state

## Tech stack

- **Next.js 15.5.15**
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 3.4**
- **ESLint CLI**

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

Useful scripts:

```bash
npm run dev
npm run lint
npm run build
```

## Mock persistence notes

This prototype stores its session and mock app data in browser localStorage so refreshes keep your current user, workspace, and mock edits.

If you want a clean reset, clear localStorage for the app in your browser.

## Project structure

```text
src/
  app/
    providers.tsx                Root client providers
    login/page.tsx               Mock sign-in entry
    app/                         Protected app area
  components/
    layout/                      App shell, top bar, sidebar, workspace switcher
    ui/                          Shared UI primitives
  hooks/
    useCurrentUser.ts
    useCurrentWorkspace.ts
  lib/
    domain/types.ts
    permissions/index.ts
    mock/
      seed.ts                    Initial dataset only
      repositories/             Mock data access + mutation helpers
      store/                    Local persistent mock app state
    session/
      mock-session.tsx          Mock auth/session provider
    services/
      ai-draft.ts
      social-connector.ts
```

## Current scope

Included now:

- workspace-aware creator dashboard
- content library + dynamic detail views
- content creation with lightweight asset attachment
- AI draft studio with local draft persistence
- publish queue controls
- inbox triage and notes
- team management interactions
- settings saved in mock state
- audit log surfaced in UI

Still deferred:

- real Supabase Auth
- database-backed repositories
- real social platform OAuth/API integration
- webhook ingestion
- real file upload/storage pipeline
- background job scheduling
- analytics and notifications

## Phase 2 direction

Planned next steps:

1. Replace mock session with Supabase Auth
2. Replace mock repositories with Supabase/Postgres implementations
3. Add real storage-backed asset uploads
4. Add platform OAuth + publish/inbox integrations
5. Add server-side authorization and RLS
6. Add background publishing workflows and notifications
