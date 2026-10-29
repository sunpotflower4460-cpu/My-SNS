import { describe, expect, it } from 'vitest'
import { canSendReply } from './reply-capability'
import type { InboxKind, SocialPlatform } from '@/lib/domain/types'

const PLATFORMS: SocialPlatform[] = ['line', 'instagram', 'youtube', 'x', 'tiktok', 'threads', 'facebook']
const KINDS: InboxKind[] = ['dm', 'comment', 'reply', 'mention']

const EXPECTED_TRUE = new Set([
  'line:dm',
  'instagram:comment',
  'instagram:reply',
  'youtube:comment',
  'youtube:reply',
  'x:mention',
  'x:reply',
])

describe('canSendReply', () => {
  it('matches the documented capability matrix for every platform x kind combination', () => {
    for (const platform of PLATFORMS) {
      for (const kind of KINDS) {
        const expected = EXPECTED_TRUE.has(`${platform}:${kind}`)
        expect(canSendReply(platform, kind), `${platform}:${kind}`).toBe(expected)
      }
    }
  })

  it('never allows sending to LINE for anything but a DM', () => {
    expect(canSendReply('line', 'comment')).toBe(false)
    expect(canSendReply('line', 'reply')).toBe(false)
    expect(canSendReply('line', 'mention')).toBe(false)
  })

  it('never allows Instagram DM sends (still needs Meta messaging review)', () => {
    expect(canSendReply('instagram', 'dm')).toBe(false)
  })

  it('never allows TikTok, Threads, or Facebook (no send/receive path at all)', () => {
    for (const kind of KINDS) {
      expect(canSendReply('tiktok', kind)).toBe(false)
      expect(canSendReply('threads', kind)).toBe(false)
      expect(canSendReply('facebook', kind)).toBe(false)
    }
  })
})
