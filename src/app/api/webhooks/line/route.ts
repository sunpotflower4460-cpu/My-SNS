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

  let events
  try {
    events = mapLineWebhookBody(payload)
  } catch (cause) {
    // Retrying an unsupported/malformed provider payload will never repair it.
    // Log it and acknowledge the delivery so LINE does not retry forever.
    console.error('Failed to map a LINE webhook delivery:', destination, cause)
    return NextResponse.json({ ingested: 0 })
  }

  const supabase = createServiceClient()

  try {
    const workspaceId = await resolveWorkspaceIdByExternalAccount(supabase, 'line', destination)
    if (!workspaceId) return NextResponse.json({ ingested: 0 })

    const contactIds = await upsertMessagingContacts(supabase, workspaceId, events)
    const ingested = await upsertInboxItems(supabase, workspaceId, events, contactIds)
    return NextResponse.json({ ingested })
  } catch (cause) {
    // Database/network failures are transient. Return non-2xx so LINE retries;
    // inbox upserts are idempotent on the provider event id, so a retry after a
    // partial commit cannot create duplicate messages.
    console.error('Transient failure ingesting a LINE webhook delivery:', destination, cause)
    return NextResponse.json({ error: 'Webhook persistence temporarily unavailable.' }, { status: 503 })
  }
}
