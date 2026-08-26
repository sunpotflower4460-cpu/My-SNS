import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveWorkspaceIdByExternalAccount, upsertInboxItems } from '@/lib/repositories/supabase/inbox-ingest'
import { verifyMetaSignature } from '@/lib/services/webhooks/verify-meta-signature'
import { mapMetaWebhookEntry, type MetaWebhookPayload } from '@/lib/services/webhooks/meta-webhook-mapper'

// Meta (Instagram) webhook receiver — comments and Instagram Messaging DMs.
// Subscribe this URL under the app's Webhooks product in the Meta App
// Dashboard: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
// GET handles the one-time subscription verification handshake; POST
// receives actual event deliveries. Both fail closed when unconfigured.

export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()
  if (!verifyToken) {
    return NextResponse.json({ error: 'Webhook is not configured (META_WEBHOOK_VERIFY_TOKEN unset).' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed.' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appSecret) {
    return NextResponse.json({ error: 'Webhook is not configured (META_APP_SECRET unset).' }, { status: 503 })
  }

  // Read as raw text, not .json(): the signature is computed over the exact
  // bytes Meta sent, and re-serializing a parsed object can produce
  // different bytes that would make a genuine request look invalid.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let ingested = 0
  let transientFailures = 0

  // Each entry is independent. Mapping failures are permanent for that payload
  // shape, so acknowledge them after logging. Persistence failures are likely
  // transient and must make the whole delivery retryable; inbox writes are
  // idempotent on provider event ids, so retrying already-saved siblings is safe.
  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue

    let events
    try {
      events = mapMetaWebhookEntry(entry)
    } catch (cause) {
      console.error('Failed to map a Meta webhook entry:', entry.id, cause)
      continue
    }

    try {
      // Not a workspace we know about (e.g. a delivery for an unrelated
      // subscription) — ignore rather than error.
      const workspaceId = await resolveWorkspaceIdByExternalAccount(supabase, 'instagram', entry.id)
      if (!workspaceId) continue

      ingested += await upsertInboxItems(supabase, workspaceId, events)
    } catch (cause) {
      transientFailures += 1
      console.error('Transient failure ingesting a Meta webhook entry:', entry.id, cause)
    }
  }

  if (transientFailures > 0) {
    return NextResponse.json(
      { error: 'Webhook persistence temporarily unavailable.', ingested, transientFailures },
      { status: 503 },
    )
  }

  return NextResponse.json({ ingested })
}
