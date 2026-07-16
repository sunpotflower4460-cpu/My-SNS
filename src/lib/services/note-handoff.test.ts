import { describe, expect, it } from 'vitest'
import type { DraftRevision } from '@/lib/domain/types'
import { formatRevisionForNote } from './note-handoff'

const baseRevision: DraftRevision = {
  id: 'rev-1',
  workspaceId: 'workspace-1',
  seedId: 'seed-1',
  socialDraftId: 'draft-1',
  channel: 'note',
  body: 'The studio session ran long, but the arrangement finally clicked.',
  hashtags: [],
  assumptions: [],
  metadata: {},
  source: 'ai',
  approvedBy: 'user-1',
  createdAt: '2026-07-16T00:00:00.000Z',
}

describe('formatRevisionForNote', () => {
  it('formats title, body, CTA, and hashtags as Markdown in reading order', () => {
    const markdown = formatRevisionForNote({
      ...baseRevision,
      title: 'Studio notes',
      cta: 'Listen to the full track this weekend.',
      hashtags: ['studio', 'newmusic'],
    })

    expect(markdown).toBe(
      '# Studio notes\n\nThe studio session ran long, but the arrangement finally clicked.\n\nListen to the full track this weekend.\n\n#studio #newmusic',
    )
  })

  it('omits missing optional fields without leaving stray blank sections', () => {
    expect(formatRevisionForNote(baseRevision)).toBe(
      'The studio session ran long, but the arrangement finally clicked.',
    )
  })
})
