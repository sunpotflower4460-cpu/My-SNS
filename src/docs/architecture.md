# Architecture Decisions

## Overview

Creator Hub is a workspace-centric content management and social media coordination platform for creators and their teams.

---

## Why Workspace-Centric Architecture

Each workspace represents an independent creator brand or team. A single user can belong to multiple workspaces, each with their own:
- Content library
- Social accounts
- Team members with role-specific permissions
- Publish queue and inbox

This model maps naturally to how creator businesses work — a musician might manage their solo project and a podcast as separate workspaces, with different team members in each.

The workspace is the **root entity** for all data. Every database query, permission check, and API call is scoped to a workspace ID.

---

## How Permissions Flow

Permissions are role-based and hierarchical:

```
owner > admin > editor > contributor > viewer
```

- **Owner**: Full control including workspace deletion and ownership transfer
- **Admin**: Full team and content management, cannot transfer ownership
- **Editor**: Content, drafts, and inbox management. No member management
- **Contributor**: Can upload and create drafts, limited editing
- **Viewer**: Read-only access across all sections

Permissions are defined in `src/lib/permissions/index.ts` as a typed `Permission` union, and checked via `hasPermission(role, permission)`. The `PermissionGate` component enforces permissions at the UI layer.

In Phase 2, Row Level Security (RLS) in Supabase will enforce permissions at the database layer so the server is never trusted blindly.

---

## Mock Layer Strategy and Upgrade Path

Phase 0/1 uses a fully in-memory mock layer:

- All domain data lives in `src/lib/mock/seed.ts`
- Service interfaces (`AiDraftGeneratorService`, `SocialConnectorAdapter`) are defined in `src/lib/services/interfaces.ts`
- Mock implementations (`MockAiDraftGeneratorService`, `MockSocialConnectorAdapter`) return fake data without network calls
- Repository interfaces are defined in `src/lib/repositories/interfaces.ts` but not yet implemented

**Upgrade Path for Phase 2:**
1. Implement each Repository interface against Supabase using the `@supabase/supabase-js` client
2. Replace mock service calls with real platform API clients (YouTube Data API, Instagram Graph API, etc.)
3. Add Supabase Auth for real login/session management
4. Add RLS policies to all tables
5. Wire up webhook endpoints for inbox ingestion

The architecture is intentionally layered so mock implementations can be swapped for real ones with minimal changes to page components.

---

## Component Architecture

```
app/app/[page]/page.tsx    — Server or client page component
  └── AppShell             — Layout wrapper
        ├── Sidebar        — Navigation
        └── TopBar         — Header with workspace switcher
              └── WorkspaceSwitcher

  └── PageHeader           — Page title + actions
  └── StatCard             — Metric display
  └── ContentCard          — Content item preview
  └── InboxItemCard        — Inbox message item
  └── DraftEditorCard      — Social draft with edit UI
  └── PermissionGate       — Role-gated wrapper
  └── EmptyState           — Placeholder for empty lists
```

UI components are composable primitives. Pages assemble them without business logic leaking into components.

---

## What Phase 2 Should Wire Up

1. **Supabase Auth** — Replace mock login with real email/password or OAuth
2. **Supabase Database** — Implement all Repository interfaces against real Postgres
3. **RLS Policies** — Enforce workspace-scoped access at DB level
4. **Social Platform APIs** — YouTube, Instagram Graph, X, TikTok, Threads, Facebook
5. **Webhook Ingestion** — Receive real-time comments, DMs, and mentions
6. **Real AI Integration** — OpenAI or Anthropic for draft generation and reply suggestions
7. **File Storage** — Supabase Storage for asset uploads
8. **Background Jobs** — Publish queue execution (e.g., pg_cron or edge functions)
9. **Notifications** — In-app and email alerts
10. **Analytics** — Engagement tracking per content and platform
