import { describe, expect, it } from 'vitest'
import type { DraftRevision } from '@/lib/domain/types'
import { wasRevisionEditedByHuman } from './draft-revisions'

const baseRevision: DraftRevision = {
  id: 'rev-1',
  workspaceId: 'workspace-1',
  seedId: 'seed-1',
  socialDraftId: 'draft-1',
  channel: 'youtube',
  body: 'Final approved copy.',
  hashtags: [],
  assumptions: [],
  metadata: {},
  source: 'ai',
  approvedBy: 'sora',
  createdAt: '2026-07-15T00:00:00.000Z',
}

describe('wasRevisionEditedByHuman', () => {
  it('is false when there is no AI snapshot to compare against (e.g. a template-sourced Revision)', () => {
    expect(wasRevisionEditedByHuman({ ...baseRevision, source: 'template', aiOriginalSnapshot: undefined })).toBe(false)
  })

  it('is false when the approved content exactly matches the AI snapshot', () => {
    const revision = { ...baseRevision, aiOriginalSnapshot: { body: baseRevision.body, hashtags: [] } }
    expect(wasRevisionEditedByHuman(revision)).toBe(false)
  })

  it('is true when the approved body differs from the AI snapshot', () => {
    const revision = { ...baseRevision, aiOriginalSnapshot: { body: 'AI original draft copy.', hashtags: [] } }
    expect(wasRevisionEditedByHuman(revision)).toBe(true)
  })

  it('is true when only the title or CTA changed, even if the body did not', () => {
    const revision = {
      ...baseRevision,
      title: 'New title',
      aiOriginalSnapshot: { body: baseRevision.body, title: 'Old title', hashtags: [] },
    }
    expect(wasRevisionEditedByHuman(revision)).toBe(true)
  })

  it('treats an absent title/CTA on both sides as equal, not as an edit', () => {
    const revision = { ...baseRevision, title: undefined, cta: undefined, aiOriginalSnapshot: { body: baseRevision.body, hashtags: [] } }
    expect(wasRevisionEditedByHuman(revision)).toBe(false)
  })

  it('is true when only the hashtags changed, even if body/title/cta did not', () => {
    const revision = {
      ...baseRevision,
      hashtags: ['music'],
      aiOriginalSnapshot: { body: baseRevision.body, hashtags: ['music', 'offbrand'] },
    }
    expect(wasRevisionEditedByHuman(revision)).toBe(true)
  })

  it('treats reordered hashtags as unedited, not as a diff', () => {
    const revision = {
      ...baseRevision,
      hashtags: ['b', 'a'],
      aiOriginalSnapshot: { body: baseRevision.body, hashtags: ['a', 'b'] },
    }
    expect(wasRevisionEditedByHuman(revision)).toBe(false)
  })
})
