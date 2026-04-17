# Creator Hub — My-SNS

A workspace-centric creator home hub for managing content, social drafts, publish queues, and team collaboration.

---

## What This App Is

Creator Hub is a multi-workspace platform built for content creators and their teams. It provides:
- A **Content Library** to manage and organize all content pieces
- An **AI Draft Studio** to generate platform-tailored social media posts
- A **Publish Queue** to schedule and track posts across platforms
- An **Inbox Hub** aggregating DMs, comments, replies, and mentions
- **Team Management** with granular role-based permissions
- **Settings** for workspace configuration and connected social platforms

---

## Current Scope: Phase 0 / Phase 1 Foundation

This is a fully navigable UI shell with:
- ✅ Complete domain type system (TypeScript)
- ✅ Role-based permission system (owner/admin/editor/contributor/viewer)
- ✅ Centralized mock/seed data
- ✅ Repository and service interfaces (ready for real implementations)
- ✅ Mock AI draft generator service
- ✅ Mock social connector adapter
- ✅ Full layout (AppShell, Sidebar, TopBar, WorkspaceSwitcher)
- ✅ All UI primitives (PageHeader, StatCard, ContentCard, RoleBadge, StatusBadge, PlatformBadge, InboxItemCard, DraftEditorCard, EmptyState, PermissionGate)
- ✅ All pages: Dashboard, Content Library, New Content, Content Detail, AI Draft Studio, Publish Queue, Inbox, Team, Settings, Login

**Not yet implemented (Phase 2):** Real auth, database persistence, OAuth platform connections, webhook ingestion, file uploads, background job scheduling.

---

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS v3**
- **ESLint**
- No external UI libraries — pure Tailwind
- No database yet — Supabase-ready architecture with mock data

---

## Project Structure

```
src/
  app/
    layout.tsx                    Root layout
    page.tsx                      Redirects to /app/dashboard
    login/page.tsx                Login UI (mocked)
    app/
      layout.tsx                  Authenticated layout (AppShell)
      dashboard/page.tsx          Dashboard with stats + recent activity
      content/page.tsx            Content library with filters
      content/new/page.tsx        New content form
      content/[id]/page.tsx       Content detail view
      drafts/page.tsx             AI Draft Studio
      queue/page.tsx              Publish Queue
      inbox/page.tsx              Inbox Hub
      team/page.tsx               Team management
      settings/page.tsx           Workspace settings
  components/
    layout/                       AppShell, Sidebar, TopBar, WorkspaceSwitcher
    ui/                           All reusable UI primitives
  lib/
    domain/types.ts               All domain interfaces
    permissions/index.ts          Role → Permission map and helpers
    mock/seed.ts                  All mock data (single source of truth)
    repositories/interfaces.ts    Repository interfaces (not yet implemented)
    services/
      interfaces.ts               Service interfaces
      ai-draft.ts                 Mock AI draft generator
      social-connector.ts         Mock social connector adapter
  docs/
    schema.md                     Supabase/PostgreSQL schema proposal
    architecture.md               Architecture decisions
```

---

## How to Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/app/dashboard`.

To view the login page: [http://localhost:3000/login](http://localhost:3000/login)

Auth is mocked — any credentials will sign you in.

---

## Mock / Seed Data

All mock data lives in `src/lib/mock/seed.ts`. It exports:

| Export | Description |
|--------|-------------|
| `MOCK_USERS` | 3 users: owner, editor, contributor |
| `MOCK_WORKSPACE` | 1 main workspace (Sunrise Creative) |
| `MOCK_MEMBERS` | 3 workspace member records |
| `MOCK_INVITATIONS` | 1 pending invitation |
| `MOCK_SOCIAL_ACCOUNTS` | 5 platforms (3 connected) |
| `MOCK_CONTENTS` | 6 content items (varied types + statuses) |
| `MOCK_ASSETS` | 4 assets |
| `MOCK_SOCIAL_DRAFTS` | 6 drafts across platforms |
| `MOCK_PUBLISH_JOBS` | 6 jobs (varied statuses) |
| `MOCK_INBOX_ITEMS` | 8 inbox items (DMs, comments, mentions) |
| `MOCK_AUDIT_LOGS` | 8 audit log entries |
| `CURRENT_USER` | Simulates the logged-in user (owner) |
| `CURRENT_WORKSPACE` | The active workspace |
| `CURRENT_MEMBER` | The active user's workspace member record |

---

## Permissions System

Defined in `src/lib/permissions/index.ts`:

| Role | Capabilities |
|------|-------------|
| `owner` | All permissions including workspace deletion and ownership transfer |
| `admin` | Full content + team management, no ownership transfer |
| `editor` | Content, drafts, inbox. No member management |
| `contributor` | Upload assets, create drafts, limited editing |
| `viewer` | Read-only across all sections |

Use `hasPermission(role, permission)` or `<PermissionGate>` in the UI.

---

## Architecture Decisions

See [`src/docs/architecture.md`](src/docs/architecture.md) for full details.

Key decisions:
- **Workspace-scoped**: All data belongs to a workspace; users can be in multiple workspaces
- **Mock-first**: Interfaces are defined; mocks implement them; real implementations swap in Phase 2
- **Permissions at the edge**: `PermissionGate` enforces at UI; RLS will enforce at DB in Phase 2
- **Service interfaces**: `AiDraftGeneratorService` and `SocialConnectorAdapter` are swappable

---

## Database Schema

See [`src/docs/schema.md`](src/docs/schema.md) for the full Supabase/PostgreSQL schema proposal.

---

## Next Steps: Phase 2

1. Wire Supabase Auth (email/password + OAuth)
2. Implement Repository interfaces against Supabase Postgres
3. Add RLS policies for workspace-scoped access
4. Connect social platform APIs (YouTube, Instagram, X, TikTok, Threads, Facebook)
5. Build webhook ingestion endpoints for real-time inbox
6. Integrate OpenAI/Anthropic for AI draft generation
7. Add Supabase Storage for file uploads
8. Build background job scheduler for publish queue
9. Add in-app notifications
10. Add analytics per content piece and platform
