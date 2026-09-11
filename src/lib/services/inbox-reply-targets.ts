import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { computeRecipientSendTime } from '@/lib/services/reply-timing'
import type { SocialPlatform } from '@/lib/domain/types'

// Send-target resolution for /api/inbox/reply/approve, split out of the route
// so it can be unit tested directly (Next.js route files may only export HTTP
// method handlers and a small fixed set of route config values).

export interface ResolvedSendTarget {
  sendTarget: string
  contactId?: string
  scheduledAt: string
}

/**
 * DM path (currently LINE only): the send target is the contact's platform
 * userId, and scheduling respects the recipient's timezone/quiet hours —
 * courtesies that make sense for a private message, not a public reply.
 */
export async function resolveDmSendTarget(
  supabase: SupabaseClient,
  workspaceId: string,
  platform: SocialPlatform,
  contactId: string | null,
  sendNow: boolean | undefined,
): Promise<ResolvedSendTarget | NextResponse> {
  const { data: account, error: accountError } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('platform', platform)
    .eq('connected', true)
    .maybeSingle()

  if (accountError) {
    return NextResponse.json({ error: `${PUBLISHING_CHANNEL_CONFIG[platform].label}の接続状態を確認できませんでした。少し後でもう一度お試しください。` }, { status: 502 })
  }
  if (!account) {
    return NextResponse.json(
      { error: `${PUBLISHING_CHANNEL_CONFIG[platform].label}アカウントが接続されていません。設定から接続してください。` },
      { status: 400 },
    )
  }

  if (!contactId) {
    return NextResponse.json(
      { error: 'この受信メッセージには送信先（相手のID）が紐づいていないため、返信を送信できません。' },
      { status: 400 },
    )
  }

  const { data: contact, error: contactError } = await supabase
    .from('messaging_contacts')
    .select('id, external_contact_id, timezone, quiet_hours_start, quiet_hours_end')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (contactError) {
    return NextResponse.json(
      { error: '送信先の連絡先情報を確認できませんでした。少し後でもう一度お試しください。' },
      { status: 503 },
    )
  }
  if (!contact) {
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

  return { sendTarget: contact.external_contact_id, contactId: contact.id, scheduledAt }
}

/**
 * Content-reply path (Instagram/YouTube comment, X reply/mention): the send
 * target is the external id of the comment/post/tweet being replied under
 * (InboxItem.externalId) — there is no "contact" and no quiet-hours concept
 * for a public reply, so it always resolves to an immediate send time.
 */
export async function resolveContentSendTarget(
  supabase: SupabaseClient,
  workspaceId: string,
  platform: SocialPlatform,
  externalId: string | null,
): Promise<ResolvedSendTarget | NextResponse> {
  const { data: account, error: accountError } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('platform', platform)
    .eq('connected', true)
    .maybeSingle()

  if (accountError) {
    return NextResponse.json({ error: `${PUBLISHING_CHANNEL_CONFIG[platform].label}の接続状態を確認できませんでした。少し後でもう一度お試しください。` }, { status: 502 })
  }
  if (!account) {
    return NextResponse.json(
      { error: `${PUBLISHING_CHANNEL_CONFIG[platform].label}アカウントが接続されていません。設定から接続してください。` },
      { status: 400 },
    )
  }

  if (!externalId) {
    return NextResponse.json(
      { error: 'このメッセージには返信先のコンテンツID（コメント/投稿ID）が紐づいていないため、返信を送信できません。' },
      { status: 400 },
    )
  }

  return { sendTarget: externalId, scheduledAt: new Date().toISOString() }
}
