import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runAutoReplySweep } from '@/lib/services/auto-reply-sweep'

// Scheduled auto-reply sweep. Drafts and enqueues replies for contacts the
// creator opted into (messaging_contacts.auto_send_enabled), each with a cancel
// window + notification — see auto-reply-sweep.ts for the safety rails. Vercel
// Cron calls this via GET with an Authorization header from CRON_SECRET.
//
// Enqueue only: the existing reply Worker (/api/messaging/run) actually sends
// the reply_mode='auto' jobs once due. That is the same claim-guarded send path
// as every other reply, so nothing here sends a message directly.

// Generation is per-item and can add up across a batch; give it room but far
// under a long-upload ceiling (these are text pushes, drafted then queued).
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return NextResponse.json({ error: 'Worker is not configured (CRON_SECRET unset).' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const result = await runAutoReplySweep(supabase)
  return NextResponse.json(result)
}
