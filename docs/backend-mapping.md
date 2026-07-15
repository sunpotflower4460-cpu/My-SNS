# Backend mapping

## Runtime boundaries

| Area | Runtime implementation | Source of truth |
| --- | --- | --- |
| Authentication | `src/lib/auth/auth-provider.tsx` | Supabase Auth |
| Application state | `src/lib/app/app-provider.tsx` | Supabase repositories |
| Content and assets | `src/lib/repositories/supabase/content.ts` | Postgres + private Storage |
| Drafts | `src/lib/repositories/supabase/drafts.ts` | `social_drafts` |
| Queue | `src/lib/repositories/supabase/queue.ts` | `publish_jobs` |
| Inbox and notes | `src/lib/repositories/supabase/inbox.ts` | `inbox_items` + `inbox_notes` |
| Audit trail | `src/lib/repositories/supabase/audit.ts` | `audit_logs` |

The removed prototype repositories are not part of the runtime path. External AI and social adapters remain explicit, fail-closed seams until their reviewed phases.

## Asset lifecycle

1. The browser holds selected `File` objects and local object URLs only until save.
2. The content record is created in the active workspace.
3. Files upload below `<workspace-id>/<content-id>/<asset-id>.<extension>`.
4. The `assets` table stores the private `storage_path`.
5. Read flows create one-hour signed URLs for previews.

Storage and table RLS independently enforce workspace membership.

## Invariants

- Every repository query includes a workspace boundary or reaches a row protected by workspace RLS.
- UI code imports `useApp()`; it does not import fixture data.
- Connectors do not return sample external data when a real integration is unavailable.
- Publish jobs and generated copy are not represented as operational until their later phases.
