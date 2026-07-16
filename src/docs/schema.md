# Database schema

Supabase PostgreSQL is the source of truth. The migrations in `supabase/migrations/` are authoritative; this document describes the current application-facing model after PR1.

## Ownership boundary

Every creator-owned row is scoped by `workspace_id`. Supabase Row Level Security uses workspace membership plus the `owner`, `admin`, `editor`, `contributor`, and `viewer` roles.

## Core creator tables

### `brand_profiles`

Reusable editorial context kept separate from individual Seeds.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| workspace_id | uuid | Workspace FK |
| name | text | Non-blank profile name |
| description | text | Purpose and worldview |
| audience | text | Default audience |
| voice_traits | text[] | Reusable voice qualities |
| values | text[] | Editorial values |
| preferred_terms | text[] | Preferred wording/spelling |
| avoided_terms | text[] | Claims or wording to avoid |
| default_call_to_action | text | Optional fallback CTA |
| language | text | Default `ja` |
| is_default | boolean | At most one default per workspace |
| created_by | uuid | Profile FK |
| created_at / updated_at | timestamptz | Audit timestamps |

Owners, admins, and editors can edit Brand Profiles. Every workspace receives a default profile through the workspace trigger.

### `seeds`

One raw creator input captured before channel-specific proposals are produced. PR1 renames the original `contents` table and preserves all existing rows and relationships.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| workspace_id | uuid | Workspace FK |
| brand_profile_id | uuid | Same-workspace Brand Profile FK |
| title | text | Working title |
| source_text | text | Optional when files carry the source |
| kind | seed_kind | music/video/image/text/mixed |
| status | seed_status | captured/ready/archived |
| goal | text | Desired outcome |
| audience | text | Optional override of Brand Profile |
| key_points | text[] | Facts/details that must stay exact |
| call_to_action | text | Optional override of Brand Profile |
| target_channels | publishing_channel[] | Desired output channels |
| tags | text[] | Search and draft context |
| created_by | uuid | Profile FK |
| created_at / updated_at | timestamptz | Audit timestamps |

The five default target channels are YouTube, note, Instagram, X, and TikTok. The enum also leaves room for Threads, Facebook, and the creator-owned website. note is explicitly a review-and-copy channel.

### `assets`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| workspace_id | uuid | Workspace FK |
| seed_id | uuid | Optional Seed FK |
| name | text | Original file name |
| url | text | Legacy fallback only |
| storage_path | text | Unique path in private `assets` bucket |
| type | asset_type | image/video/audio/document |
| size | bigint | Bytes |
| uploaded_by | uuid | Profile FK |
| created_at | timestamptz | Upload time |

Objects use `<workspace-id>/<seed-id>/<asset-id>.<extension>` and are read through short-lived signed URLs.

## Downstream workflow tables

### `social_drafts`

Drafts reference `seed_id`. Their `channel` uses `publishing_channel`, which allows note drafts without pretending note is an OAuth-connected social account. Status remains draft/approved/rejected.

### `publish_jobs`

Jobs reference `seed_id`, a draft, and a `channel`. The current UI can inspect, retry, and cancel stored jobs; PR3 supplies immutable approved revisions and a real worker boundary.

### `inbox_items` and `inbox_notes`

External-style inbox items remain tied to a real `social_platform` and may optionally reference a `seed_id`. Notes are internal workspace records. External sync is not implemented yet.

### `audit_logs`

Workspace-scoped append-only activity records. PR1 adds `seed_created`, `seed_updated`, and `brand_profile_updated` application actions while retaining historical content action rendering.

## Supporting tables

- `profiles` mirrors authenticated users.
- `workspaces`, `workspace_members`, and `workspace_invitations` define ownership and roles.
- `social_accounts` remains restricted to real social platforms; note is never stored as an OAuth account.
- `ai_reply_suggestions` is reserved for reviewed inbox-assistance work.

## Deferred schemas

PR2 and PR3 will add structured proposal provenance, model/cost tracking, immutable approvals, delivery attempts, and scheduler idempotency. Provider credentials and webhook payloads are intentionally not modeled as plaintext application fields.
