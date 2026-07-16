import { describe, expect, it } from 'vitest'
import { mapMetaWebhookEntry, type MetaWebhookEntry } from './meta-webhook-mapper'

describe('mapMetaWebhookEntry', () => {
  it('maps a comments change into a comment event', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      time: 1_700_000_000,
      changes: [
        {
          field: 'comments',
          value: { id: 'comment-1', text: 'Love this!', from: { id: 'u1', username: 'fan_account' } },
        },
      ],
    }

    const events = mapMetaWebhookEntry(entry)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'instagram',
      kind: 'comment',
      externalId: 'comment-1',
      authorHandle: 'fan_account',
      text: 'Love this!',
    })
    expect(events[0].receivedAt).toBe(new Date(1_700_000_000 * 1000).toISOString())
  })

  it('falls back to the commenter id when no username is present', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      changes: [{ field: 'comments', value: { id: 'comment-2', text: 'hi', from: { id: 'u2' } } }],
    }

    expect(mapMetaWebhookEntry(entry)[0].authorHandle).toBe('u2')
  })

  it('ignores change fields other than comments (e.g. mentions — a documented gap)', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      changes: [{ field: 'mentions', value: { id: 'media-1' } }],
    }

    expect(mapMetaWebhookEntry(entry)).toEqual([])
  })

  it('skips a comments change missing text or id', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      changes: [{ field: 'comments', value: { id: 'comment-3' } }],
    }

    expect(mapMetaWebhookEntry(entry)).toEqual([])
  })

  it('maps a messaging event into a dm event, using the millisecond timestamp as-is', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      messaging: [{ sender: { id: 'u3' }, timestamp: 1_700_000_000_000, message: { mid: 'msg-1', text: 'Can you help?' } }],
    }

    const events = mapMetaWebhookEntry(entry)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ platform: 'instagram', kind: 'dm', externalId: 'msg-1', authorHandle: 'u3', text: 'Can you help?' })
    expect(events[0].receivedAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('skips our own echoed reply instead of treating it as inbound', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      messaging: [{ sender: { id: 'us' }, message: { mid: 'msg-2', text: 'Thanks for reaching out!', is_echo: true } }],
    }

    expect(mapMetaWebhookEntry(entry)).toEqual([])
  })

  it('combines comments and messaging from the same entry', () => {
    const entry: MetaWebhookEntry = {
      id: 'ig-account-1',
      changes: [{ field: 'comments', value: { id: 'comment-4', text: 'nice', from: { id: 'u4', username: 'someone' } } }],
      messaging: [{ sender: { id: 'u5' }, message: { mid: 'msg-3', text: 'question' } }],
    }

    expect(mapMetaWebhookEntry(entry)).toHaveLength(2)
  })
})
