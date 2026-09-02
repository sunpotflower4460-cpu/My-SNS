import { describe, expect, it } from 'vitest'
import type { SocialAccount, SocialDraft } from '@/lib/domain/types'
import { buildSendChannelState, latestDraftsByChannel, validateSendPlan } from './send-plan'

function draft(over: Partial<SocialDraft>): SocialDraft {
  return {
    id: 'd1',
    workspaceId: 'w',
    seedId: 's1',
    channel: 'x',
    draftText: 'body',
    hashtags: [],
    assumptions: [],
    metadata: {},
    source: 'ai',
    tone: 'calm',
    length: 'short',
    status: 'draft',
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...over,
  }
}

function account(over: Partial<SocialAccount>): SocialAccount {
  return {
    id: 'a1',
    workspaceId: 'w',
    platform: 'x',
    handle: '@one',
    connected: true,
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...over,
  }
}

describe('latestDraftsByChannel', () => {
  it('keeps the newest non-rejected draft per channel', () => {
    const drafts = [
      draft({ id: 'old', channel: 'x', updatedAt: '2026-07-20T00:00:00.000Z' }),
      draft({ id: 'new', channel: 'x', updatedAt: '2026-07-21T00:00:00.000Z' }),
      draft({ id: 'note', channel: 'note', updatedAt: '2026-07-21T00:00:00.000Z' }),
      draft({ id: 'rej', channel: 'youtube', status: 'rejected', updatedAt: '2026-07-22T00:00:00.000Z' }),
    ]
    expect(latestDraftsByChannel(drafts).map((entry) => entry.id)).toEqual(['note', 'new'])
  })
})

describe('buildSendChannelState', () => {
  it('auto-selects the only connected account', () => {
    const state = buildSendChannelState(draft({ channel: 'x' }), [account({ platform: 'x' })])
    expect(state.selected).toBe(true)
    expect(state.selectedAccountId).toBe('a1')
    expect(state.blockedReason).toBeUndefined()
  })

  it('leaves multi-account channels unchecked until a handle is picked', () => {
    const state = buildSendChannelState(draft({ channel: 'x' }), [
      account({ id: 'a1', handle: '@one' }),
      account({ id: 'a2', handle: '@two' }),
    ])
    expect(state.selected).toBe(false)
    expect(state.blockedReason).toMatch(/アカウント/)
  })

  it('treats note as a copy handoff with no account pick', () => {
    const state = buildSendChannelState(draft({ id: 'n1', channel: 'note' }), [])
    expect(state.noteHandoff).toBe(true)
    expect(state.selected).toBe(true)
    expect(state.blockedReason).toBeUndefined()
  })
})

describe('validateSendPlan', () => {
  it('rejects an empty selection', () => {
    const channel = { ...buildSendChannelState(draft({ channel: 'note' }), []), selected: false }
    expect(validateSendPlan([channel], 'now')).toEqual({ ok: false, error: '送る媒体を1つ以上選んでください。' })
  })

  it('requires a datetime when scheduling', () => {
    const channel = buildSendChannelState(draft({ channel: 'note' }), [])
    expect(validateSendPlan([channel], 'scheduled').ok).toBe(false)
    expect(validateSendPlan([channel], 'scheduled', '2026-09-03T12:00:00.000Z').ok).toBe(true)
  })

  it('rejects a selected channel that still needs an account', () => {
    const channel = {
      ...buildSendChannelState(draft({ channel: 'x' }), [
        account({ id: 'a1', handle: '@one' }),
        account({ id: 'a2', handle: '@two' }),
      ]),
      selected: true,
    }
    expect(validateSendPlan([channel], 'now')).toEqual({
      ok: false,
      error: 'X: 投稿するアカウントを選んでください。',
    })
  })
})
