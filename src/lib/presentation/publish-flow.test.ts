import { describe, expect, it } from 'vitest'
import { computePublishFlow, type PublishFlowInput } from './publish-flow'
import type { PublishingChannel } from '@/lib/domain/types'

function draft(channel: PublishingChannel, status: 'draft' | 'approved' | 'rejected') {
  return { channel, status }
}
function job(channel: PublishingChannel, status: 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled') {
  return { channel, status }
}

function base(over: Partial<PublishFlowInput> = {}): PublishFlowInput {
  return {
    seedId: 's1',
    targetChannels: ['x'],
    isReady: true,
    drafts: [],
    jobs: [],
    ...over,
  }
}

function stateOf(flow: ReturnType<typeof computePublishFlow>, id: string) {
  return flow.steps.find((s) => s.id === id)?.state
}

describe('computePublishFlow', () => {
  it('starts at prepare when the seed is not ready', () => {
    const flow = computePublishFlow(base({ isReady: false }))
    expect(stateOf(flow, 'prepare')).toBe('current')
    expect(stateOf(flow, 'propose')).toBe('todo')
    expect(flow.primary).toEqual({ label: '素材を整える', href: '/app/seeds/s1' })
    expect(flow.complete).toBe(false)
  })

  it('moves to propose once ready but no drafts exist', () => {
    const flow = computePublishFlow(base())
    expect(stateOf(flow, 'prepare')).toBe('done')
    expect(stateOf(flow, 'propose')).toBe('current')
    expect(flow.primary?.href).toBe('/app/drafts?seed=s1')
  })

  it('requires every target channel to have a draft before propose is done', () => {
    const flow = computePublishFlow(base({ targetChannels: ['x', 'note'], drafts: [draft('x', 'draft')] }))
    expect(stateOf(flow, 'propose')).toBe('current') // note still missing a draft
  })

  it('advances to approve when all channels have a draft', () => {
    const flow = computePublishFlow(base({ targetChannels: ['x', 'note'], drafts: [draft('x', 'draft'), draft('note', 'draft')] }))
    expect(stateOf(flow, 'propose')).toBe('done')
    expect(stateOf(flow, 'approve')).toBe('current')
    expect(flow.approvedChannels).toBe(0)
  })

  it('advances to schedule only when every channel is approved', () => {
    const partial = computePublishFlow(base({ targetChannels: ['x', 'note'], drafts: [draft('x', 'approved'), draft('note', 'draft')] }))
    expect(stateOf(partial, 'approve')).toBe('current')
    expect(partial.approvedChannels).toBe(1)

    const full = computePublishFlow(base({ targetChannels: ['x', 'note'], drafts: [draft('x', 'approved'), draft('note', 'approved')] }))
    expect(stateOf(full, 'approve')).toBe('done')
    expect(stateOf(full, 'schedule')).toBe('current')
    expect(full.approvedChannels).toBe(2)
  })

  it('completes when every approved channel has a scheduled or published job', () => {
    const flow = computePublishFlow(
      base({
        targetChannels: ['x'],
        drafts: [draft('x', 'approved')],
        jobs: [job('x', 'scheduled')],
      }),
    )
    expect(flow.steps.every((s) => s.state === 'done')).toBe(true)
    expect(flow.primary).toBeNull()
    expect(flow.complete).toBe(true)
  })

  it('does not count a failed or cancelled job as scheduled', () => {
    const flow = computePublishFlow(
      base({ targetChannels: ['x'], drafts: [draft('x', 'approved')], jobs: [job('x', 'failed')] }),
    )
    expect(stateOf(flow, 'schedule')).toBe('current')
    expect(flow.complete).toBe(false)
  })

  it('cannot complete propose with no channels selected even if ready', () => {
    const flow = computePublishFlow(base({ targetChannels: [], isReady: true }))
    expect(stateOf(flow, 'prepare')).toBe('done')
    expect(stateOf(flow, 'propose')).toBe('current')
  })
})
