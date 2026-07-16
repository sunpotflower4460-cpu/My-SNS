# Remaining migration seams

PR0 closes the prototype seams for auth, application persistence, asset upload, Seed detail assets, inbox notes, and audit detail. PR1 adds the Seed and Brand Profile boundary consumed by later AI and publishing work.

## Draft generation

- Current: deterministic templates in `src/lib/services/ai-draft.ts`
- Behavior: clearly labeled as templates; no invented AI or viral claims
- Input: one Seed plus its separate Brand Profile and selected publishing channels
- Next: PR2 adds a reviewed provider with structured output, missing-information suggestions, proposal cards, and explicit approval

## Social connectors

- Current: `UnavailableSocialConnectorAdapter` fails closed
- Next: platform-specific OAuth, encrypted credentials, account capability checks, and publish adapters

## Publishing

- Current: queue records can be listed, retried, and cancelled
- Next: immutable approved revisions, idempotent attempts, scheduler, worker, and external post IDs

## Manual actions intentionally postponed

- Provider developer-account creation and OAuth consent
- YouTube and TikTok audit submissions
- Existing Supabase project migration/deployment approval

These actions are needed only when the corresponding implementation is ready for an end-to-end account test.
