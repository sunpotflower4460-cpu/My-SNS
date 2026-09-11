import type { InboxKind, SocialPlatform } from '@/lib/domain/types'

/**
 * Whether the app can actually SEND a reply to one inbox item right now —
 * distinct from whether it can *receive* one (see each connector's
 * fetchInbox/fetchComments/fetchMentions for ingestion gaps). Used by
 * /api/inbox/reply/approve to gate sending, and by the inbox UI to decide
 * between a real "send" action and a "copy and open the app" fallback.
 *
 * - LINE: DM only (the original Phase 1 messaging concierge path).
 * - Instagram: public comment replies only (POST /{comment-id}/replies).
 *   Instagram DM still needs Meta's messaging permission + App Review.
 * - YouTube: public comment replies only (comments.insert with parentId).
 *   YouTube has no creator DM API at all.
 * - X: reply-to-tweet only (mentions/replies to the account's own posts).
 *   This itself only needs the free-tier tweet.write scope already
 *   requested — but X mention/reply ingestion needs a paid API tier
 *   (see x-connector.ts fetchMentions), so in practice no X inbox item
 *   exists to route here until that is set up separately.
 * - TikTok: no public comment API exists at all — never reachable.
 * - Threads/Facebook: no inbox integration is built (publish-only channels).
 */
export function canSendReply(platform: SocialPlatform, kind: InboxKind): boolean {
  switch (platform) {
    case 'line':
      return kind === 'dm'
    case 'instagram':
      return kind === 'comment' || kind === 'reply'
    case 'youtube':
      return kind === 'comment' || kind === 'reply'
    case 'x':
      return kind === 'mention' || kind === 'reply'
    default:
      return false
  }
}
