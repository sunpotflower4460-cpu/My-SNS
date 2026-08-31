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

  it('keeps a 3–8 character thumbnailHook as overlay copy, without labeling it as an AI guess', () => {
    const [youtube] = parseDraftProposals(
      {
        drafts: [
          {
            channel: 'youtube',
            title: 'New arrangement',
            body: 'Video body',
            hashtags: [],
            assumptions: [],
            metadata: { thumbnailHook: '今すぐ見る' },
          },
        ],
      },
      seed,
      ['youtube'],
      'calm',
      'medium',
    )
    expect(youtube.metadata.thumbnailHook).toBe('今すぐ見る')
    expect(youtube.assumptions).toEqual([])
  })

  it('drops copy-editing notes from assumptions while keeping guessed facts', () => {
    const [youtube] = parseDraftProposals(
      {
        drafts: [
          {
            channel: 'youtube',
            title: 'New arrangement',
            body: 'Video body',
            hashtags: [],
            assumptions: [
              '原文をYouTube向けに整えた',
              'サムネイルのフック「今すぐ見る」はAIの提案です。画面で確認してください。',
              '開催日がなかったので来週土曜と仮定した',
            ],
            metadata: { thumbnailHook: '今すぐ見る' },
          },
        ],
      },
      seed,
      ['youtube'],
      'calm',
      'medium',
    )
    expect(youtube.assumptions).toEqual(['開催日がなかったので来週土曜と仮定した'])
  })

  it('shortens a slightly-too-long hook without recording it as an assumption', () => {
    const [youtube] = parseDraftProposals(
      {
        drafts: [
          {
            channel: 'youtube',
            body: 'Video body',
            hashtags: [],
            assumptions: [],
            metadata: { thumbnailHook: '新曲無料公開スタート' },
          },
        ],
      },
      seed,
      ['youtube'],
      'calm',
      'medium',
    )
    expect(typeof youtube.metadata.thumbnailHook).toBe('string')
    expect(String(youtube.metadata.thumbnailHook).length).toBeGreaterThanOrEqual(3)
    expect(String(youtube.metadata.thumbnailHook).length).toBeLessThanOrEqual(8)
    expect(youtube.assumptions).toEqual([])
  })

  it('drops a paragraph-shaped thumbnailHook instead of treating it as overlay text', () => {
    const [youtube] = parseDraftProposals(
      {
        drafts: [
          {
            channel: 'youtube',
            body: 'Video body',
            hashtags: [],
            assumptions: [],
            metadata: { thumbnailHook: 'A very long slogan that is not thumbnail type at all.' },
          },
        ],
      },
      seed,
      ['youtube'],
      'calm',
      'medium',
    )
    expect(youtube.metadata.thumbnailHook).toBeUndefined()
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

  it('tells the model not to list copy-editing or thumbnail hooks as assumptions', () => {
    const { system } = buildDraftGenerationPrompt(seed, ['youtube'], 'calm', 'medium')
    expect(system).toContain('Proofreading the creator\'s own words is not an assumption')
    expect(system).toContain('Do not record the hook in `assumptions`')
  })
})
