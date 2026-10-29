import { describe, expect, it } from 'vitest'
import type { DraftRevision } from '@/lib/domain/types'
import {
  buildDraftStyleExamples,
  formatDraftStyleExamplesForPrompt,
  freezeAiOriginalSnapshot,
  selectRecentStyleCorrections,
  snapshotForFirstAiSave,
  summarizeStyleTendencies,
  truncateStylePreview,
  wasRevisionEditedByHuman,
} from './draft-style-learning'

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

function revision(over: Partial<DraftRevision>): DraftRevision {
  return { ...baseRevision, ...over }
}

describe('snapshotForFirstAiSave', () => {
  it('returns null for template-sourced drafts', () => {
    expect(
      snapshotForFirstAiSave({
        source: 'template',
        draftText: 'Template copy',
        hashtags: [],
      }),
    ).toBeNull()
  })

  it('prefers the generation-time snapshot over the content being saved', () => {
    const frozen = snapshotForFirstAiSave({
      source: 'ai',
      aiOriginalSnapshot: { title: 'AI title', body: 'AI body', hashtags: ['studio'], cta: 'Listen' },
      title: 'Edited title',
      draftText: 'Human edited the body before first save',
      hashtags: ['studio', 'extra'],
      cta: 'Please listen',
    })

    expect(frozen).toEqual({ title: 'AI title', body: 'AI body', hashtags: ['studio'], cta: 'Listen' })
  })

  it('falls back to the content being saved when no generation-time copy was passed', () => {
    expect(
      snapshotForFirstAiSave({
        source: 'ai',
        title: 'Saved title',
        draftText: 'Saved body',
        hashtags: ['a'],
        cta: 'Go',
      }),
    ).toEqual({ title: 'Saved title', body: 'Saved body', hashtags: ['a'], cta: 'Go' })
  })
})

describe('wasRevisionEditedByHuman', () => {
  it('is false when there is no AI snapshot to compare against', () => {
    expect(wasRevisionEditedByHuman({ ...baseRevision, source: 'template', aiOriginalSnapshot: undefined })).toBe(false)
  })

  it('is false when the approved content exactly matches the AI snapshot', () => {
    expect(wasRevisionEditedByHuman(revision({ aiOriginalSnapshot: { body: baseRevision.body, hashtags: [] } }))).toBe(false)
  })

  it('is true for a body, title, CTA, or hashtag-only correction', () => {
    expect(wasRevisionEditedByHuman(revision({ aiOriginalSnapshot: { body: 'AI original draft copy.', hashtags: [] } }))).toBe(true)
    expect(
      wasRevisionEditedByHuman(
        revision({ title: 'New title', aiOriginalSnapshot: { body: baseRevision.body, title: 'Old title', hashtags: [] } }),
      ),
    ).toBe(true)
    expect(
      wasRevisionEditedByHuman(
        revision({ hashtags: ['music'], aiOriginalSnapshot: { body: baseRevision.body, hashtags: ['music', 'offbrand'] } }),
      ),
    ).toBe(true)
  })

  it('treats reordered hashtags as unedited', () => {
    expect(
      wasRevisionEditedByHuman(
        revision({ hashtags: ['b', 'a'], aiOriginalSnapshot: { body: baseRevision.body, hashtags: ['a', 'b'] } }),
      ),
    ).toBe(false)
  })
})

describe('buildDraftStyleExamples', () => {
  it('keeps only edited AI revisions, newest-first, and caps per channel', () => {
    const revisions = [
      revision({
        id: 'yt-new',
        channel: 'youtube',
        createdAt: '2026-08-02T00:00:00.000Z',
        body: 'Approved newer',
        aiOriginalSnapshot: { body: 'AI newer', hashtags: [] },
      }),
      revision({
        id: 'yt-old',
        channel: 'youtube',
        createdAt: '2026-08-01T00:00:00.000Z',
        body: 'Approved older',
        aiOriginalSnapshot: { body: 'AI older', hashtags: [] },
      }),
      revision({
        id: 'yt-unedited',
        channel: 'youtube',
        createdAt: '2026-08-03T00:00:00.000Z',
        body: 'Same',
        aiOriginalSnapshot: { body: 'Same', hashtags: [] },
      }),
      revision({
        id: 'x-hashtags',
        channel: 'x',
        createdAt: '2026-08-02T00:00:00.000Z',
        body: 'Same body',
        hashtags: ['keep'],
        aiOriginalSnapshot: { body: 'Same body', hashtags: ['keep', 'drop'] },
      }),
    ]

    const examples = buildDraftStyleExamples(revisions, 1)
    expect(examples).toHaveLength(2)
    expect(examples[0]).toMatchObject({
      channel: 'youtube',
      aiProposed: { body: 'AI newer' },
      humanApproved: { body: 'Approved newer' },
    })
    expect(examples[1].channel).toBe('x')
    expect(examples[1].aiProposed.hashtags).toEqual(['keep', 'drop'])
    expect(examples[1].humanApproved.hashtags).toEqual(['keep'])
  })
})

describe('formatDraftStyleExamplesForPrompt', () => {
  it('omits the block when there are no examples', () => {
    expect(formatDraftStyleExamplesForPrompt([])).toBe('')
  })

  it('shows a compact field diff and still includes the kept body for voice', () => {
    const block = formatDraftStyleExamplesForPrompt([
      {
        channel: 'x',
        aiProposed: { body: 'Same body', hashtags: ['keep', 'drop'], cta: 'Listen now' },
        humanApproved: { body: 'Same body', hashtags: ['keep'], cta: 'よかったら聴いてみてください' },
      },
    ])

    expect(block).toContain('Past edits this creator made')
    expect(block).toContain('body (kept): "Same body"')
    expect(block).toContain('#keep #drop')
    expect(block).toContain('#keep')
    expect(block).toContain('Listen now')
    expect(block).toContain('よかったら聴いてみてください')
    expect(block).not.toContain('title:')
  })
})

describe('summarizeStyleTendencies', () => {
  it('does not invent a tendency from a single example', () => {
    expect(
      summarizeStyleTendencies([
        {
          channel: 'x',
          aiProposed: { body: 'A long AI body that goes on', hashtags: ['a', 'b'] },
          humanApproved: { body: 'Short', hashtags: ['a'] },
        },
      ]),
    ).toEqual([])
  })

  it('records shorten-body and fewer-hashtags notes without copying Seed wording', () => {
    const notes = summarizeStyleTendencies([
      {
        channel: 'x',
        aiProposed: { body: 'A long AI body that goes on for a while', hashtags: ['a', 'b', 'c'], title: 'Keep me', cta: 'Click' },
        humanApproved: { body: 'Short', hashtags: ['a'], title: 'Keep me', cta: 'Please listen' },
      },
      {
        channel: 'x',
        aiProposed: { body: 'Another long AI proposal about a different seed', hashtags: ['x', 'y'], title: 'Also keep', cta: 'Buy' },
        humanApproved: { body: 'Brief', hashtags: ['x'], title: 'Also keep', cta: 'よかったら' },
      },
    ])

    expect(notes).toEqual([
      'x: tends to shorten the body',
      'x: tends to use fewer hashtags',
      'x: often rewrites the CTA (keep the Seed\'s CTA facts, match the approved voice)',
    ])
    expect(notes.join(' ')).not.toContain('different seed')
    expect(notes.join(' ')).not.toContain('Please listen')
  })

  it('records a drop-title tendency without quoting the dropped title', () => {
    const notes = summarizeStyleTendencies([
      {
        channel: 'youtube',
        aiProposed: { title: 'Secret gig next Friday', body: 'Body one', hashtags: [] },
        humanApproved: { body: 'Body one', hashtags: [] },
      },
      {
        channel: 'youtube',
        aiProposed: { title: 'Album out now', body: 'Body two', hashtags: [] },
        humanApproved: { body: 'Body two', hashtags: [] },
      },
    ])

    expect(notes).toEqual(['youtube: tends to drop the title'])
    expect(notes.join(' ')).not.toContain('Secret gig')
    expect(notes.join(' ')).not.toContain('Album out now')
  })
})

describe('selectRecentStyleCorrections', () => {
  it('returns newest edited AI revisions with field diffs, dropping unedited ones', () => {
    const rows = selectRecentStyleCorrections(
      [
        revision({
          id: 'old',
          createdAt: '2026-07-01T00:00:00.000Z',
          body: 'New',
          aiOriginalSnapshot: { body: 'Old', hashtags: [] },
        }),
        revision({
          id: 'new',
          createdAt: '2026-08-01T00:00:00.000Z',
          title: 'Approved title',
          body: 'Same',
          aiOriginalSnapshot: { title: 'AI title', body: 'Same', hashtags: [] },
        }),
        revision({
          id: 'same',
          createdAt: '2026-09-01T00:00:00.000Z',
          body: 'Untouched',
          aiOriginalSnapshot: { body: 'Untouched', hashtags: [] },
        }),
      ],
      8,
    )

    expect(rows.map((row) => row.revisionId)).toEqual(['new', 'old'])
    expect(rows[0].diffs).toEqual([{ field: 'title', before: 'AI title', after: 'Approved title' }])
  })
})

describe('truncateStylePreview', () => {
  it('shows an empty marker and truncates long values', () => {
    expect(truncateStylePreview('   ')).toBe('（空）')
    expect(truncateStylePreview('abcdefghij', 8)).toBe('abcdefgh…')
  })
})

describe('freezeAiOriginalSnapshot', () => {
  it('trims blanks to undefined and keeps empty hashtags as an array', () => {
    expect(freezeAiOriginalSnapshot({ title: '  ', body: 'Body', hashtags: null, cta: '  ' })).toEqual({
      title: undefined,
      body: 'Body',
      hashtags: [],
      cta: undefined,
    })
  })
})
