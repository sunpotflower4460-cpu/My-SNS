import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  resolveWorkspaceIdByExternalAccount,
  upsertInboxItems,
  upsertMessagingContacts,
} from '@/lib/repositories/supabase/inbox-ingest'
import { verifyLineSignature } from '@/lib/services/webhooks/verify-line-signature'
import { mapLineWebhookBody, type LineWebhookBody } from '@/lib/services/webhooks/line-webhook-mapper'

// LINE Messaging API webhook receiver — LINE Official Account DMs.
// Register this URL as the channel's Webhook URL in the LINE Developers
// console. LINE has no GET verification handshake (it sends a test POST with
// events:[]), so only POST is handled. Fails closed when unconfigured.
// https://developers.line.biz/en/reference/messaging-api/#webhooks

export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim()
  if (!channelSecret) {
    return NextResponse.json({ error: 'Webhook is not configured (LINE_CHANNEL_SECRET unset).' }, { status: 503 })
  }

  // Raw text, not .json(): the signature is over the exact bytes LINE sent.
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature')

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }

  let payload: LineWebhookBody
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // `destination` is the bot's own userId, saved as the account's
  // external_account_id at connect time. A verification/test POST omits it.
  const destination = payload.destination
  if (!destination) {
    return NextResponse.json({ ingested: 0 })
  }

  const supabase = createServiceClient()
  let ingested = 0

  try {
    const workspaceId = await resolveWorkspaceIdByExternalAccount(supabase, 'line', destination)
    if (workspaceId) {
      const events = mapLineWebhookBody(payload)
      const contactIds = await upsertMessagingContacts(supabase, workspaceId, events)
      ingested = await upsertInboxItems(supabase, workspaceId, events, contactIds)
    }
  } catch (cause) {
    // A transient DB error or an unexpected payload shape must never turn into
    // a 500 that makes LINE retry-storm the delivery forever.
    console.error('Failed to ingest a LINE webhook delivery:', destination, cause)
  }

  // Always 200 once the signature verifies and the body parses — LINE retries
  // on non-2xx, and "nothing new to ingest" is not a failure.
  return NextResponse.json({ ingested })
}
