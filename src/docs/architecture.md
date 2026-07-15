# Creator Hub architecture

## Runtime flow

```text
Next.js pages
  -> AuthProvider / AppProvider
    -> workspace-scoped Supabase repositories
      -> Postgres tables protected by RLS
      -> private Storage protected by object policies
```

The app provider is the client-side façade. Pages do not access seeded or local fixture repositories.

## Security boundary

- A workspace is the ownership and authorization boundary.
- Table rows carry `workspace_id` and are protected with RLS.
- Asset object names begin with the workspace UUID.
- The `assets` bucket is private.
- Preview URLs are signed for one hour and are not stored as permanent public URLs.
- Security-definer membership helpers pin `search_path` and qualify referenced schemas.

## Current product truth

- Auth, workspace data, content, drafts, queue state, inbox notes, and audits persist in Supabase.
- Draft generation is a deterministic template preview, not an AI claim.
- External social connectors are unavailable and fail closed.
- No background publisher runs yet.

## Verification

Pull requests run lint, TypeScript checking, unit tests, and a production Next.js build on Node 22.
