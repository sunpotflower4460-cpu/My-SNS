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

  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue

    // Not a workspace we know about (e.g. a delivery for an unrelated
    // subscription) — ignore rather than error; Meta fans this app's
    // webhook out to every subscribed page/account, not just ours.
    const workspaceId = await resolveWorkspaceIdByExternalAccount(supabase, 'instagram', entry.id)
    if (!workspaceId) continue

    const events = mapMetaWebhookEntry(entry)
    ingested += await upsertInboxItems(supabase, workspaceId, events)
  }

  // Always 200 once the signature is verified and the body parses, even when
  // 0 events matched — Meta retries aggressively on non-2xx responses, and
  // "nothing new to ingest" is not a failure.
  return NextResponse.json({ ingested })
}
