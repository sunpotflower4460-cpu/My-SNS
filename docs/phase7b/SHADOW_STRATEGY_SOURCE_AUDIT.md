# Phase 7B — Shadow Strategy Source Audit

Status: source re-audit before My-SNS shadow import. No Bridge or SNS-AI code was changed in this phase.

## Audit metadata

| Item | Value |
|---|---|
| Bridge repository | `sunpotflower4460-cpu/SNS-Growth-Bridge` |
| Phase 7A PR | [#16](https://github.com/sunpotflower4460-cpu/SNS-Growth-Bridge/pull/16) |
| Phase 7A merge | squash merge PASS |
| Bridge Phase 7A merged main SHA | `9375dc5371e20a0c4ce22fb78984463bc774f796` |
| Phase 7A confirmed head | `d4e0932cc61df7123b88fd2592461b4dceaa0420` |
| My-SNS repository | `sunpotflower4460-cpu/My-SNS` |
| Previous My-SNS reference | `cafde5995b80e9054fb4780a10e02db9c3c033ff` |
| My-SNS Phase 7B base main | `cafde5995b80e9054fb4780a10e02db9c3c033ff` |
| Audit datetime UTC | `2026-09-07T12:00:00Z` |

`MY_SNS_PHASE_7B_BASE_SHA` equals the previous reference. Latest `origin/main` was fetched at the start of this phase; it had not moved.

## Bridge contracts read after #16 merge

| Path | Used by Phase 7B |
|---|---|
| `packages/contracts/src/strategy.ts` | `GrowthStrategySnapshot` fields, status invariant, pattern shape |
| `packages/contracts/src/account-link.ts` | `CrossProductAccountLink`; `status` + `confirmation: 'explicit-operator'` |
| `packages/contracts/src/platform.ts` | Bridge platforms and growth dimensions |
| `packages/contracts/src/identity.ts` | `GrowthSubjectRef`; `creatorId` remains optional and unresolved |
| `packages/identity-links/*` | Explicit operator link only; handle / `externalAccountId` are not join keys |
| `packages/runtime-transport/src/linked-strategy.ts` | Offline linked snapshot; `creatorId` must stay absent |

Accepted Canonical major: `schemaVersion === 1`. Accepted strategy version: `sns-ai-learn-parity-v1`.

## Analytics page structure

Path: `src/app/app/analytics/page.tsx`

- Client page. Reads AppProvider for publish/AI/correction summaries and live `fetchPostMetrics`.
- Local state today: `metricsByJob` only.
- Human Correction section already exists as a separate analytics card. Shadow Growth Strategy is added as another isolated card, not merged into Brand Profile or Human Correction.
- AppProvider is **not** extended with shadow strategy state.

## Permission structure

Path: `src/lib/permissions/index.ts`

- Roles: `owner | admin | editor | contributor | viewer`.
- Server authorization uses `requireWorkspaceMember()` (`src/lib/api/workspace-access.ts`): DB error → 503, missing membership / missing permission → 403.
- Phase 7B adds `view_shadow_strategy` and `manage_shadow_strategy` for owner/admin only. Editor / Contributor / Viewer remain blocked on the server. The Analytics UI hides the section for those roles so the client does not issue guaranteed 403 fetches.

## AppProvider usage range

Path: `src/lib/app/app-provider.tsx`

AppProvider already owns workspace identity, social accounts, seeds, drafts, queue, inbox, calendar, notifications, and `generateChannelDrafts`. It is shared across publishing and generation. Phase 7B therefore keeps Shadow Strategy fetch/import state inside the Analytics page (and a page-local section component). No shadow fields, loaders, or mutators are added to AppProvider.

## SocialAccount identity

Path: `src/lib/domain/types.ts`, `src/lib/repositories/supabase/social-accounts.ts`

```text
SocialAccount.id            UUID  (identity)
SocialAccount.workspaceId   UUID
SocialAccount.platform      SocialPlatform
SocialAccount.handle        display only
SocialAccount.connected     connection state, not identity
SocialAccount.externalAccountId  not a mapping key
```

Identity join for Phase 7B:

```text
request.workspaceId === link.mySns.workspaceId === social_accounts.workspace_id
request.socialAccountId === link.mySns.socialAccountId === social_accounts.id
link.snsAi.accountId === strategy.subject.accountId
link.platform === strategy.platform === social_accounts.platform
```

Handle and `externalAccountId` are not used as join keys. `connected === false` remains a valid historical identity for storage.

## Supabase / RLS patterns

- Persistence is Supabase/Postgres. No Prisma.
- Service-role-only tables already exist (`social_account_credentials`, `ai_budget_claims`): `ENABLE ROW LEVEL SECURITY` with **no browser policies**.
- User API routes authenticate with the cookie client, then use `createServiceClient()` for secrets / worker-scoped tables.
- Audit insert failure is best-effort after the authoritative write (`src/lib/repositories/supabase/audit.ts`).
- `shadow_growth_strategies` follows the service-role-only pattern: RLS on, no SELECT/INSERT/UPDATE/DELETE policies for `anon` / `authenticated`. Browser clients cannot read or delete the table directly.
- Rows are **immutable during workspace lifetime**: a `BEFORE UPDATE` trigger rejects in-place mutation. There is no Shadow Strategy DELETE repository function or API.
- Parent lifecycle CASCADE is allowed. `workspace_id` and `social_account_id` use `ON DELETE CASCADE` so deleting a workspace or social account can remove shadow rows. There is no unconditional child `BEFORE DELETE` trigger, because that would block the existing workspace/account cleanup path.

## Relevant drift from `cafde5995b80e9054fb4780a10e02db9c3c033ff`

None. Latest My-SNS `main` is that commit.

Checked paths are unchanged:

- `src/app/app/analytics/page.tsx`
- `src/lib/app/app-provider.tsx`
- `src/lib/domain/types.ts`
- `src/lib/permissions/index.ts`
- `src/lib/api/workspace-access.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/service.ts`
- `src/lib/repositories/supabase/audit.ts`
- `src/lib/repositories/supabase/social-accounts.ts`
- `supabase/migrations/*`
- `package.json`

Workspace identity, SocialAccount identity, permission model, analytics architecture, database/RLS architecture, and draft-generation data flow did not require redesign. Phase 7B proceeds against this SHA.

## Stop-condition decision

Continue. No mapping blockers. My-SNS will parse a Bridge Canonical subset in-repo and will **not** add SNS-Growth-Bridge as a git/npm/filesystem dependency.
