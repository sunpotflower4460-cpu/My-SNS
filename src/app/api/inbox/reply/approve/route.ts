import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { createReplyJob, findNonCancelledReplyJob } from '@/lib/repositories/supabase/reply-queue'
import { processReplyJob } from '@/lib/services/reply-worker'
import { isLineResultUnknownError } from '@/lib/services/connectors/line-connector'
import { computeRecipientSendTime } from '@/lib/services/reply-timing'
import type { ReplyJob } from '@/lib/domain/types'

// Approve a suggested reply and enqueue it for sending. The human's edited text
// is captured as an immutable snapshot on the reply_job; the send target and an
// absolute-UTC scheduled_at (computed at enqueue from the contact's timezone /
// quiet hours) are baked in at enqueue so the Worker stays timezone-agnostic.
//
// Honesty gates (CLAUDE.md #5, #7):
// - Instagram DM sending needs Meta's messaging permission + app review, which
//   we don't have — Phase 1 receives and proposes for IG but does NOT send.
//   Approving an IG reply returns 409 rather than pretending it will deliver.
// - A LINE reply with no connected LINE account, or no known send target,
//   returns 400 — never a silent no-op that looks like success.
//
// sendNow=true sends immediately (inline, via the service client); otherwise the
// job waits for its scheduled_at and the batch Worker (/api/messaging/run).

interface ApproveReplyBody {
  workspaceId?: string
  inboxItemId?: string
  replyText?: string
  suggestionId?: string
  sendNow?: boolean
}

export async function POST(request: NextRequest) {
  let body: ApproveReplyBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, inboxItemId, suggestionId, sendNow } = body
  const replyText = body.replyText?.trim()
  if (!workspaceId || !inboxItemId || !replyText) {
    return NextResponse.json({ error: 'workspaceId、inboxItemId、返信本文は必須です。' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })
  }

  const membership = await requireWorkspaceMember(supabase, workspaceId, user.id, 'reply_inbox', 'このワークスペースで返信する権限がありません。')
  if (isNextResponse(membership)) return membership

  const { data: item, error: itemError } = await supabase
    .from('inbox_items')
    .select('id, platform, kind, contact_id')
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (itemError || !item) {
    return NextResponse.json({ error: '受信メッセージが見つかりません。' }, { status: 404 })
  }

  // Honest platform gate. Instagram DM sending is deferred (Meta messaging
  // permission + review); everything except LINE has no Phase 1 send path.
  if (item.platform === 'instagram') {
    return NextResponse.json(
      {
        error:
          'Instagram DMの送信は現在未対応です（Metaのメッセージ送信権限と審査が必要なため、Phase 1では受信と返信案の作成のみ対応しています）。',
      },
      { status: 409 },
    )
  }
  if (item.platform !== 'line') {
    return NextResponse.json(
      { error: `${item.platform}への返信送信は未対応です（Phase 1で送信できるのはLINEのみです）。` },
      { status: 409 },
    )
  }

  // Need a connected LINE account (the send credential). Treat a database
  // read failure differently from a real "not connected" state — silently
  // collapsing the former into the latter can prompt needless reconnects.
  const { data: account, error: accountError } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('platform', 'line')
    .eq('connected', true)
    .maybeSingle()

  if (accountError) {
    return NextResponse.json({ error: 'LINEの接続状態を確認できませんでした。少し後でもう一度お試しください。' }, { status: 502 })
  }
  if (!account) {
    return NextResponse.json(
      { error: 'LINE公式アカウントが接続されていません。設定から接続してください。' },
      { status: 400 },
    )
  }

  // … and a known send target (the contact's LINE userId), captured at ingest.
  if (!item.contact_id) {
    return NextResponse.json(
      { error: 'この受信メッセージには送信先（相手のLINE ID）が紐づいていないため、返信を送信できません。' },
      { status: 400 },
    )
  }

  const { data: contact, error: contactError } = await supabase
    .from('messaging_contacts')
    .select('id, external_contact_id, timezone, quiet_hours_start, quiet_hours_end')
    .eq('id', item.contact_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (contactError || !contact) {
    return NextResponse.json(
      { error: '送信先の連絡先情報が見つからないため、返信を送信できません。' },
      { status: 400 },
    )
  }

  // "Send now" bypasses recipient-timing entirely; otherwise defer to the
  // recipient-appropriate instant (absolute UTC, frozen onto the job).
  const scheduledAt = sendNow
    ? new Date().toISOString()
    : computeRecipientSendTime(new Date(), {
        timeZone: contact.timezone ?? undefined,
        quietStart: contact.quiet_hours_start ?? undefined,
        quietEnd: contact.quiet_hours_end ?? undefined,
      })

  let job: ReplyJob
  let reusedExistingJob = false
  try {
    job = await createReplyJob(supabase, {
      workspaceId,
      inboxItemId,
      contactId: contact.id,
      suggestionId: suggestionId ?? undefined,
      platform: 'line',
      replyText,
      sendTarget: contact.external_contact_id,
      replyMode: 'scheduled',
      scheduledAt,
      createdBy: user.id,
    })
  } catch (cause) {
    // The DB insert guard serializes all manual/auto creations for this inbox
    // item. If our INSERT lost that race (or this is an HTTP retry after the
    // first request committed), recover the durable existing job instead of
    // creating/reporting a duplicate send.
    let existing: ReplyJob | null = null
    try {
      existing = await findNonCancelledReplyJob(supabase, workspaceId, inboxItemId)
    } catch (lookupCause) {
      console.error('Failed to resolve an existing reply job after enqueue failure:', lookupCause)
    }

    if (!existing) {
      // The low-level cause can contain PostgREST/database details. Keep it in
      // server logs and return stable creator-facing copy instead.
      console.error(`Failed to enqueue reply for inbox item ${inboxItemId}:`, cause)
      return NextResponse.json(
        { error: '返信を安全に予約できませんでした。少し待ってからもう一度お試しください。' },
        { status: 502 },
      )
    }

    const requestedSuggestionId = suggestionId ?? undefined
    if (existing.replyText !== replyText || existing.suggestionId !== requestedSuggestionId) {
      return NextResponse.json(
        { error: 'このメッセージには別の返信がすでに予約・送信されています。受信箱を再読み込みして既存の返信状態を確認してください。' },
        { status: 409 },
      )
    }

    job = existing
    reusedExistingJob = true
  }

  if (!reusedExistingJob) {
    const { error: auditError } = await supabase.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: 'inbox_reply_scheduled',
      target_type: 'inbox_item',
      target_id: inboxItemId,
      metadata: { platform: 'line', replyJobId: job.id, scheduledAt, sendNow: Boolean(sendNow) },
    })
    if (auditError) console.error('Failed to audit scheduled inbox reply:', auditError)
  }

  // Approving a reply resolves the item: it no longer needs action and is read.
  // Best-effort — a failure here must not fail the (already-committed) enqueue.
  const { error: itemUpdateError } = await supabase
    .from('inbox_items')
    .update({ needs_action: false, is_read: true })
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
  if (itemUpdateError) console.error('Failed to clear inbox item after approving a reply:', itemUpdateError)

  if (!sendNow) {
    if (job.status === 'sent') {
      return NextResponse.json({ status: 'sent', job, reused: reusedExistingJob })
    }
    if (job.status === 'failed') {
      if (isLineResultUnknownError(job.errorMessage)) {
        return NextResponse.json(
          {
            status: 'failed',
            job,
            error:
              '前回のLINE送信は相手に届いたか判定できません。二重送信を防ぐため再送は停止しています。LINEの会話を確認し、必要ならこのジョブを閉じてから新しい返信を作成してください。',
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { status: 'failed', job, error: 'この返信は以前の送信で失敗しています。既存ジョブの「再送」を使用してください。' },
        { status: 409 },
      )
    }
    return NextResponse.json({ status: 'scheduled', job, reused: reusedExistingJob })
  }

  // A retry that discovers the durable job is already sent must never call the
  // external platform again.
  if (job.status === 'sent') {
    return NextResponse.json({ status: 'sent', job, reused: true })
  }

  if (job.status === 'failed' && isLineResultUnknownError(job.errorMessage)) {
    return NextResponse.json(
      {
        status: 'failed',
        job,
        error:
          '前回のLINE送信は相手に届いたか判定できません。二重送信を防ぐため、この返信の即時再送は停止しています。会話を確認し、必要なら新しい返信として作成してください。',
      },
      { status: 409 },
    )
  }

  // Immediate send: process inline with the service client (credentials +
  // append-only attempt writes need service role). processReplyJob never throws.
  let serviceClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Reply send service client is unavailable:', cause)
    return NextResponse.json(
      { error: '返信送信に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
  }

  const result = await processReplyJob(serviceClient, {
    id: job.id,
    workspaceId: job.workspaceId,
    platform: 'line',
    inboxItemId: job.inboxItemId,
    sendTarget: job.sendTarget,
    replyText: job.replyText,
    createdBy: job.createdBy,
  })

  if (result.success) {
    return NextResponse.json({ status: 'sent', job, reused: reusedExistingJob })
  }

  if (result.skipped) {
    // The scheduled Worker claimed this due job in the tiny window between
    // enqueue/recovery and our inline claim — it may well have already delivered
    // it. Don't report a false failure: re-read the authoritative row status.
    const { data: current, error: currentError } = await serviceClient
      .from('reply_jobs')
      .select('status')
      .eq('id', job.id)
      .maybeSingle()
    if (currentError) {
      return NextResponse.json(
        { status: 'scheduled', job, error: '返信処理は別のWorkerが進行中ですが、最新状態を確認できませんでした。受信箱を再読み込みしてください。' },
        { status: 409 },
      )
    }
    const status = (current?.status as 'scheduled' | 'sent' | 'failed' | 'cancelled' | undefined) ?? 'scheduled'
    if (status === 'failed') {
      return NextResponse.json(
        { status: 'failed', job, error: '返信の送信に失敗しました。受信箱で詳細を確認してください。' },
        { status: 502 },
      )
    }
    // 'sent' (Worker delivered it) or 'scheduled' (Worker is sending it right
    // now) — either way this is not a failure.
    return NextResponse.json({ status: status === 'sent' ? 'sent' : 'scheduled', job, reused: reusedExistingJob })
  }

  // A genuine failure: the job row now carries status='failed' + error_message;
  // surface that the send didn't go through rather than reporting a false success.
  return NextResponse.json(
    { status: 'failed', job, error: '返信の送信に失敗しました。受信箱で詳細を確認してください。' },
    { status: 502 },
  )
}
