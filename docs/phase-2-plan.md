# Phase 2 plan

## Goal

Replace prototype-only auth, persistence, and integrations with real Supabase-backed infrastructure without rewriting page flows.

## 1. Auth migration plan

### What mock auth does today

- Stores the selected seeded user ID in `localStorage`
- Restores the session client-side in `src/lib/session/mock-session.tsx`
- Protects `/app/*` through the protected app layout
- Exposes session state through `useCurrentUser()`

### What Supabase Auth should replace

- `src/lib/session/mock-session.tsx` should become a Supabase-backed session provider
- `src/lib/session/persistence.ts` can be removed once session cookies and Supabase client refresh flow take over
- Login should stop selecting seeded users and instead call Supabase sign-in methods

### Expected session/user mapping

- Supabase `auth.users.id` -> current `User.id`
- Supabase email/profile -> current `User.email`, `User.name`, `User.avatarUrl`
- The top bar and settings page should continue to read from the same session hook surface

## 2. Delivery order

1. Replace mock session with Supabase Auth
2. Replace local mock repositories with Supabase/Postgres repositories
3. Replace prototype asset preparation with real storage uploads
4. Add the first real social connector
5. Move permissions and authorization checks server-side with RLS

## 3. Minimal migration strategy

- Keep page components calling hooks and app-layer methods
- Swap provider internals before changing page UX
- Preserve current domain types as the shared contract where practical
- Introduce server actions or API routes only at repository and integration boundaries

## 4. Deferred after Phase 2 start

- Background publishing workers
- Webhook ingestion
- Analytics and notifications
- Full invitation acceptance flow
