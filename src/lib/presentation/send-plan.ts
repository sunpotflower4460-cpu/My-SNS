import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { CORE_PUBLISHING_CHANNELS, type PublishingChannel, type SocialAccount, type SocialDraft } from '@/lib/domain/types'
import { connectedAccountsForPlatform, isSocialPlatformChannel } from '@/lib/publish/account-target'
import { parseDraftPublishOptions } from '@/lib/publish/draft-publish-options'

export type SendTiming = 'now' | 'scheduled'

export interface SendChannelAccount {
  id: string
  handle: string
}

export interface SendChannelState {
  channel: PublishingChannel
  draftId: string
  label: string
  selected: boolean
  noteHandoff: boolean
  accounts: SendChannelAccount[]
  selectedAccountId?: string
  blockedReason?: string
}

export type SendPlanResult =
  | { ok: true; targets: SendChannelState[] }
  | { ok: false; error: string }

/**
 * One draft per channel, preferring the most recently updated non-rejected row.
 * Generated (unsaved) drafts usually have a later `updatedAt` than saved copies.
 */
export function latestDraftsByChannel(drafts: SocialDraft[]): SocialDraft[] {
  const latest = new Map<PublishingChannel, SocialDraft>()
  for (const draft of drafts) {
    if (draft.status === 'rejected') continue
    const previous = latest.get(draft.channel)
    if (!previous || previous.updatedAt <= draft.updatedAt) latest.set(draft.channel, draft)
  }
  return CORE_PUBLISHING_CHANNELS
    .map((channel) => latest.get(channel))
    .filter((draft): draft is SocialDraft => Boolean(draft))
}

export function buildSendChannelState(draft: SocialDraft, accounts: SocialAccount[]): SendChannelState {
  const label = PUBLISHING_CHANNEL_CONFIG[draft.channel]?.shortLabel ?? draft.channel
  const base = {
    channel: draft.channel,
    draftId: draft.id,
    label,
    selected: true,
    noteHandoff: draft.channel === 'note' || draft.channel === 'website',
    accounts: [] as SendChannelAccount[],
    selectedAccountId: undefined as string | undefined,
    blockedReason: undefined as string | undefined,
  }

  if (!isSocialPlatformChannel(draft.channel)) {
    return base
  }

  const connected = connectedAccountsForPlatform(accounts, draft.channel)
  const options = parseDraftPublishOptions(draft.metadata)
  if (connected.length === 0) {
    return {
      ...base,
      selected: false,
      blockedReason: '設定からアカウントを接続してください。',
    }
  }

  const storedId = options.socialAccountId
  const storedOk = storedId ? connected.some((account) => account.id === storedId) : false
  const selectedAccountId = storedOk ? storedId : connected.length === 1 ? connected[0].id : undefined

  return {
    ...base,
    selected: Boolean(selectedAccountId),
    accounts: connected.map((account) => ({ id: account.id, handle: account.handle })),
    selectedAccountId,
    blockedReason: selectedAccountId ? undefined : '投稿するアカウントを選んでください。',
  }
}

export function validateSendPlan(
  channels: SendChannelState[],
  timing: SendTiming,
  scheduledAtIso?: string,
): SendPlanResult {
  const selected = channels.filter((channel) => channel.selected)
  if (selected.length === 0) {
    return { ok: false, error: '送る媒体を1つ以上選んでください。' }
  }

  const blocked = selected.find((channel) => channel.blockedReason)
  if (blocked) {
    return { ok: false, error: `${blocked.label}: ${blocked.blockedReason}` }
  }

  if (timing === 'scheduled') {
    if (!scheduledAtIso) return { ok: false, error: '予約する日時を入れてください。' }
    const when = Date.parse(scheduledAtIso)
    if (!Number.isFinite(when)) return { ok: false, error: '予約する日時の形式を確認してください。' }
  }

  return { ok: true, targets: selected }
}

export interface SendAllPlan {
  timing: SendTiming
  scheduledAt?: string
  targets: SendChannelState[]
}
