import { describe, expect, it } from 'vitest'
import type { Content } from '@/lib/domain/types'
import { TemplateDraftGeneratorService } from './ai-draft'

const content: Content = {
  id: 'content-1',
  workspaceId: 'workspace-1',
  title: 'Re:trip',
  body: 'A quiet record about returning to a familiar place.',
  type: 'music',
  status: 'ready',
  tags: ['music', 'release'],
  authorId: 'sora',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

describe('template draft generator', () => {
  it('creates neutral drafts without invented viral prompts', async () => {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(
      content,
      ['youtube', 'tiktok'],
      'calm',
      'medium',
    )

    expect(drafts).toHaveLength(2)
    expect(drafts.every((draft) => draft.createdBy === 'sora')).toBe(true)
    expect(drafts.map((draft) => draft.draftText).join('\n')).not.toMatch(/#fyp|subscribe|hit the bell/i)
  })
})
