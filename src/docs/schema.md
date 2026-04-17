# Database Schema Proposal

> This schema is designed for Supabase (PostgreSQL). Phase 2 will implement the actual migrations.

---

## Tables

### `users`
Managed by Supabase Auth. Extended with a `profiles` table.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, from auth.users |
| email | text | Unique |
| name | text | Display name |
| avatar_url | text | Optional |
| created_at | timestamptz | Default now() |

---

### `workspaces`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Not null |
| slug | text | Unique |
| logo_url | text | Optional |
| owner_id | uuid | FK → users.id |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `slug` (unique), `owner_id`

---

### `workspace_members`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| user_id | uuid | FK → users.id |
| role | text | enum: owner/admin/editor/contributor/viewer |
| joined_at | timestamptz | |

**Indexes:** `(workspace_id, user_id)` unique

---

### `invitations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| email | text | |
| role | text | WorkspaceRole |
| status | text | pending/accepted/expired/revoked |
| invited_by | uuid | FK → users.id |
| created_at | timestamptz | |
| expires_at | timestamptz | |

---

### `social_accounts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| platform | text | SocialPlatform enum |
| handle | text | |
| connected | boolean | |
| access_token | text | Encrypted in Phase 2 |
| refresh_token | text | Encrypted in Phase 2 |
| connected_at | timestamptz | Optional |

**Indexes:** `(workspace_id, platform)` unique

---

### `contents`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| title | text | |
| body | text | Optional |
| type | text | music/video/image/text/mixed |
| status | text | draft/ready/published/archived |
| tags | text[] | |
| author_id | uuid | FK → users.id |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `workspace_id`, `status`, `type`

---

### `assets`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| content_id | uuid | Optional FK → contents.id |
| name | text | |
| url | text | Supabase Storage URL |
| type | text | image/video/audio/document |
| size | bigint | Bytes |
| uploaded_by | uuid | FK → users.id |
| created_at | timestamptz | |

---

### `social_drafts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| content_id | uuid | FK → contents.id |
| platform | text | SocialPlatform |
| draft_text | text | |
| tone | text | |
| length | text | short/medium/long |
| status | text | draft/approved/rejected |
| created_by | uuid | FK → users.id |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `publish_jobs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| content_id | uuid | FK → contents.id |
| draft_id | uuid | FK → social_drafts.id |
| platform | text | SocialPlatform |
| status | text | draft/scheduled/published/failed/cancelled |
| scheduled_at | timestamptz | Optional |
| published_at | timestamptz | Optional |
| error_message | text | Optional |
| created_by | uuid | FK → users.id |
| created_at | timestamptz | |

**Indexes:** `workspace_id`, `status`, `scheduled_at`

---

### `inbox_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| platform | text | SocialPlatform |
| kind | text | dm/comment/reply/mention |
| author_handle | text | |
| author_avatar_url | text | Optional |
| text | text | |
| content_id | uuid | Optional FK → contents.id |
| received_at | timestamptz | |
| is_read | boolean | |
| needs_action | boolean | |
| is_starred | boolean | |
| ai_summary | text | Optional |

**Indexes:** `workspace_id`, `is_read`, `needs_action`, `platform`

---

### `inbox_notes`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| inbox_item_id | uuid | FK → inbox_items.id |
| author_id | uuid | FK → users.id |
| text | text | |
| created_at | timestamptz | |

---

### `ai_reply_suggestions`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| inbox_item_id | uuid | FK → inbox_items.id |
| suggested_text | text | |
| tone | text | |
| created_at | timestamptz | |

---

### `audit_logs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | FK → workspaces.id |
| actor_id | uuid | FK → users.id |
| action | text | AuditAction enum |
| target_type | text | Optional |
| target_id | uuid | Optional |
| metadata | jsonb | Optional |
| created_at | timestamptz | |

**Indexes:** `workspace_id`, `actor_id`, `created_at DESC`

---

## Row Level Security (Phase 2)

All tables will use Supabase RLS to ensure:
- Users can only access data in workspaces they belong to
- Role checks will be enforced at the database level via `workspace_members`
- Audit log writes are restricted to server-side service role

---

## Phase 2 Additions
- `ai_jobs` table for tracking async AI generation jobs
- `webhooks` table for platform event ingestion
- `notifications` table for in-app alerts
- Encryption for `access_token` / `refresh_token` in `social_accounts`
