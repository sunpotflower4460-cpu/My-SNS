import { describe, expect, it } from 'vitest'
import type { Seed } from '@/lib/domain/types'
import { buildDraftGenerationPrompt, calculateGenerationCost, parseDraftProposals } from './anthropic-draft'

const seed: Seed = {
  id: 'seed-1',
  workspaceId: 'workspace-1',
  title: 'Studio note',
  sourceText: 'A short, factual update from today.',
  kind: 'text',
  status: 'ready',
  goal: 'Share progress.',
  audience: 'Listeners',
  keyPoints: ['Recorded a new arrangement'],
  callToAction: 'Listen when you have a quiet moment.',
  targetChannels: ['youtube', 'x'],
  brandProfileId: 'brand-1',
  tags: ['studio'],
  createdBy: 'sora',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

describe('parseDraftProposals', () => {
  it('maps a valid tool response into SocialDraft proposals for every requested channel', () => {
    const drafts = parseDraftProposals(
      {
        drafts: [
          { channel: 'youtube', title: 'New arrangement', body: 'Video body', hashtags: ['studio'], assumptions: [] },
          { channel: 'x', body: 'X body', hashtags: [], cta: 'Listen now', assumptions: ['Assumed evening posting time.'] },
        ],
      },
      seed,
      ['youtube', 'x'],
      'calm',
      'medium',
    )

    expect(drafts).toHaveLength(2)
    expect(drafts.map((d) => d.channel)).toEqual(['youtube', 'x'])
    expect(drafts.every((d) => d.source === 'ai')).toBe(true)
    expect(drafts.find((d) => d.channel === 'x')?.assumptions).toEqual(['Assumed evening posting time.'])
    expect(drafts.find((d) => d.channel === 'youtube')?.assumptions).toEqual([])
  })

  it('throws when the model omits a requested channel instead of silently dropping it', () => {
    expect(() =>
      parseDraftProposals(
        { drafts: [{ channel: 'youtube', body: 'Video body', hashtags: [], assumptions: [] }] },
        seed,
        ['youtube', 'x'],
        'calm',
        'medium',
      ),
    ).toThrow(/x/)
  })

  it('throws when a proposal has an empty body rather than accepting an empty draft', () => {
    expect(() =>
      parseDraftProposals(
        { drafts: [{ channel: 'youtube', body: '   ', hashtags: [], assumptions: [] }] },
        seed,
        ['youtube'],
        'calm',
        'medium',
      ),
    ).toThrow(/empty body/)
  })

  it('throws when the tool input is not a drafts array at all', () => {
    expect(() => parseDraftProposals({ nope: true }, seed, ['youtube'], 'calm', 'medium')).toThrow(/drafts array/)
  })
})

describe('calculateGenerationCost', () => {
  it('returns 0 when no pricing environment variables are configured', () => {
    expect(calculateGenerationCost(1_000_000, 1_000_000)).toBe(0)
  })
})

describe('buildDraftGenerationPrompt style examples (PR7)', () => {
  it('omits the style-examples section entirely when none are given', () => {
    const { user } = buildDraftGenerationPrompt(seed, ['youtube'], 'calm', 'medium', null, [])
    expect(user).not.toContain('Past edits')
  })

  it('includes past edit examples as a distinct block, without discarding the rest of the prompt', () => {
    const { user } = buildDraftGenerationPrompt(seed, ['youtube'], 'calm', 'medium', null, [
      { channel: 'youtube', aiProposed: 'Check out my new track!', humanApproved: 'New track is up — link below.' },
    ])

    expect(user).toContain('Past edits this creator made')
    expect(user).toContain('Check out my new track!')
    expect(user).toContain('New track is up — link below.')
    expect(user).toContain(`Seed title: ${seed.title}`)
  })

  it('mentions past-edit examples in the system prompt only when relevant guidance is needed either way (always present, harmless when unused)', () => {
    const { system } = buildDraftGenerationPrompt(seed, ['youtube'], 'calm', 'medium')
    expect(system).toContain('past-edit examples')
  })
})
