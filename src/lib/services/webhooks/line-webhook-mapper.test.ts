import { describe, expect, it } from 'vitest'
import { mapLineWebhookBody, type LineWebhookBody } from './line-webhook-mapper'

describe('mapLineWebhookBody', () => {
  it('maps a text message from a user source into a dm event', () => {
    const body: LineWebhookBody = {
      destination: 'Ubotuser',
      events: [
        {
          type: 'message',
          timestamp: 1_700_000_000_000,
          source: { type: 'user', userId: 'Ucontact1' },
          message: { id: 'msg-1', type: 'text', text: 'こんにちは' },
          replyToken: 'ignored-reply-token',
        },
      ],
    }

    const events = mapLineWebhookBody(body)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'line',
      kind: 'dm',
      externalId: 'msg-1',
      authorHandle: 'Ucontact1',
      text: 'こんにちは',
    })
    expect(events[0].receivedAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('skips non-text messages (image/sticker) — a documented Phase 1 gap', () => {
    const body: LineWebhookBody = {
      events: [
        { type: 'message', source: { type: 'user', userId: 'U1' }, message: { id: 'm', type: 'image' } },
      ],
    }
    expect(mapLineWebhookBody(body)).toEqual([])
  })

  it('skips group/room sources that have no per-person userId', () => {
    const body: LineWebhookBody = {
      events: [
        { type: 'message', source: { type: 'group', groupId: 'G1' }, message: { id: 'm', type: 'text', text: 'hi' } },
      ],
    }
    expect(mapLineWebhookBody(body)).toEqual([])
  })

  it('skips a group source even when it carries a userId (1:1-only Phase 1 scope)', () => {
    // LINE includes source.userId in a group event when the sender friended the
    // OA — a presence check alone would mislabel this group message as a DM.
    const body: LineWebhookBody = {
      events: [
        { type: 'message', source: { type: 'group', groupId: 'G1', userId: 'U1' }, message: { id: 'm', type: 'text', text: 'hi all' } },
      ],
    }
    expect(mapLineWebhookBody(body)).toEqual([])
  })

  it('skips non-message events (follow/join/postback)', () => {
    const body: LineWebhookBody = {
      events: [{ type: 'follow', source: { type: 'user', userId: 'U1' } }],
    }
    expect(mapLineWebhookBody(body)).toEqual([])
  })

  it('maps multiple text messages in one delivery', () => {
    const body: LineWebhookBody = {
      events: [
        { type: 'message', timestamp: 1, source: { type: 'user', userId: 'U1' }, message: { id: 'a', type: 'text', text: 'one' } },
        { type: 'message', timestamp: 2, source: { type: 'user', userId: 'U2' }, message: { id: 'b', type: 'text', text: 'two' } },
      ],
    }
    expect(mapLineWebhookBody(body)).toHaveLength(2)
  })
})
