import { describe, expect, it } from 'vitest'
import type { Seed } from '@/lib/domain/types'
import { formatRevisionForHandoff } from './publish-handoff'
import { TemplateDraftGeneratorService } from './ai-draft'

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
  targetChannels: ['youtube', 'note', 'instagram', 'x', 'tiktok'],
  brandProfileId: 'brand-1',
  tags: ['studio'],
  createdBy: 'sora',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

describe('template draft generator', () => {
  it('creates explicit templates for the five core channels including note', async () => {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(
      seed,
      seed.targetChannels,
      'calm',
      'medium',
    )

    expect(drafts.map((draft) => draft.channel)).toEqual(seed.targetChannels)
    expect(drafts.every((draft) => draft.createdBy === 'sora')).toBe(true)
    expect(drafts.every((draft) => draft.aiOriginalSnapshot === undefined)).toBe(true)
    expect(drafts.map((draft) => draft.draftText).join('\n')).not.toMatch(/#fyp|subscribe|hit the bell/i)
  })

  it('keeps the X template inside the platform character limit', async () => {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(
      { ...seed, sourceText: 'a'.repeat(500) },
      ['x'],
      'calm',
      'long',
    )

    expect(drafts[0].draftText.length).toBeLessThanOrEqual(280)
  })

  it('does not repeat the title, CTA or hashtags once the handoff appends them', async () => {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(
      { ...seed, callToAction: 'プロフィールのリンクから', tags: ['sora', 'daily'], sourceText: 'a'.repeat(500) },
      seed.targetChannels,
      'calm',
      'medium',
    )

    for (const draft of drafts) {
      const copied = formatRevisionForHandoff(
        { title: draft.title, body: draft.draftText, hashtags: draft.hashtags, cta: draft.cta },
        draft.channel,
      )
      const count = (needle: string) => copied.split(needle).length - 1
      expect(count('プロフィールのリンクから'), `${draft.channel} CTA`).toBeLessThanOrEqual(1)
      expect(count('#sora'), `${draft.channel} hashtag`).toBeLessThanOrEqual(1)
      if (draft.title) expect(count(draft.title), `${draft.channel} title`).toBeLessThanOrEqual(1)
      if (draft.channel === 'x') expect(copied.length).toBeLessThanOrEqual(280)
    }
  })
})
