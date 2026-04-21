# Backend mapping

## Domain entity -> likely tables

| Current entity | Likely table | Notes |
| --- | --- | --- |
| users | `profiles` or `users` | Usually keyed from Supabase Auth user ID |
| workspaces | `workspaces` | Stores workspace identity and owner |
| workspace_members | `workspace_members` | One row per user/workspace membership |
| invitations | `workspace_invitations` | Pending and accepted invitation history |
| contents | `contents` | Core content records |
| assets | `assets` | Metadata rows pointing at Supabase Storage paths |
| social_drafts | `social_drafts` | Platform-specific copy tied to content |
| publish_jobs | `publish_jobs` | Scheduled, failed, cancelled, published states |
| inbox_items | `inbox_items` | Imported DMs, comments, mentions, replies |
| inbox_notes | `inbox_notes` | Internal teammate notes on inbox items |
| ai_reply_suggestions | `ai_reply_suggestions` | Optional generated reply records |
| audit_logs | `audit_logs` | User-visible activity trail |

## Likely relations

- `workspace_members.workspace_id` -> `workspaces.id`
- `workspace_members.user_id` -> auth/profile user ID
- `workspace_invitations.workspace_id` -> `workspaces.id`
- `contents.workspace_id` -> `workspaces.id`
- `contents.author_id` -> auth/profile user ID
- `assets.workspace_id` -> `workspaces.id`
- `assets.content_id` -> `contents.id`
- `social_drafts.workspace_id` -> `workspaces.id`
- `social_drafts.content_id` -> `contents.id`
- `publish_jobs.workspace_id` -> `workspaces.id`
- `publish_jobs.content_id` -> `contents.id`
- `publish_jobs.draft_id` -> `social_drafts.id`
- `inbox_items.workspace_id` -> `workspaces.id`
- `inbox_items.content_id` -> `contents.id` when linked
- `inbox_notes.inbox_item_id` -> `inbox_items.id`
- `inbox_notes.author_id` -> auth/profile user ID
- `audit_logs.workspace_id` -> `workspaces.id`
- `audit_logs.actor_id` -> auth/profile user ID

## Repository replacement map

| Current file | Current role | Supabase direction |
| --- | --- | --- |
| `src/lib/mock/repositories/workspaces.ts` | Workspace, member, invitation access | Replace with workspace/member/invitation Postgres repository methods |
| `src/lib/mock/repositories/content.ts` | Content and asset metadata mutations | Replace with content repository + storage-backed asset writes |
| `src/lib/mock/repositories/drafts.ts` | Draft listing and updates | Replace with `social_drafts` table repository |
| `src/lib/mock/repositories/queue.ts` | Queue status mutations | Replace with `publish_jobs` repository and job orchestration layer |
| `src/lib/mock/repositories/inbox.ts` | Inbox state and notes | Replace with inbox import repository + notes table |
| `src/lib/mock/repositories/audit.ts` | Audit trail writes | Replace with `audit_logs` persistence service |
| `src/lib/mock/store/provider.tsx` | App-layer façade over repositories | Keep the façade shape, swap mock internals for Supabase-backed calls |

## Notes

- The current domain model already maps cleanly to relational tables.
- Workspace scoping should stay explicit in every repository call.
- Audit logging should remain centralized so wording stays consistent across UI and backend writes.
