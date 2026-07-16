import type { PublishingChannel, Seed, SocialDraft } from '@/lib/domain/types'
import type { DraftGenerationContext, DraftGeneratorService } from './interfaces'

type DraftLength = 'short' | 'medium' | 'long'

function truncate(text: string, limit: number): string {
  const normalized = text.trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function hashtags(seed: Seed, limit = seed.tags.length): string {
  return seed.tags.slice(0, limit).map((tag) => `#${tag}`).join(' ')
}

function keyPoints(seed: Seed): string {
  return seed.keyPoints.map((point) => `- ${point}`).join('\n')
}

const CHANNEL_TEMPLATES: Record<PublishingChannel, (seed: Seed, tone: string, length: DraftLength) => string> = {
  instagram: (seed, _tone, length) => {
    const sourceLimit = length === 'short' ? 120 : length === 'medium' ? 360 : 900
    return [seed.title, truncate(seed.sourceText ?? '', sourceLimit), seed.callToAction, hashtags(seed)]
      .filter(Boolean)
      .join('\n\n')
  },
  x: (seed) => {
    return truncate([seed.title, seed.sourceText, seed.callToAction, hashtags(seed, 2)].filter(Boolean).join(' — '), 280)
  },
  youtube: (seed) => {
    return [seed.title, seed.sourceText, keyPoints(seed), seed.callToAction, hashtags(seed)].filter(Boolean).join('\n\n')
  },
  note: (seed) => {
    return [seed.title, seed.sourceText, keyPoints(seed), seed.callToAction].filter(Boolean).join('\n\n')
  },
  threads: (seed, _tone, length) => {
    const sourceLimit = length === 'short' ? 180 : length === 'medium' ? 360 : 700
    return [seed.title, truncate(seed.sourceText ?? '', sourceLimit), seed.callToAction].filter(Boolean).join('\n\n')
  },
  tiktok: (seed) => {
    return [seed.title, truncate(seed.sourceText ?? '', 180), seed.callToAction, hashtags(seed, 4)]
      .filter(Boolean)
      .join('\n\n')
  },
  facebook: (seed, _tone, length) => {
    const sourceLimit = length === 'short' ? 180 : length === 'medium' ? 500 : 1200
    return [seed.title, truncate(seed.sourceText ?? '', sourceLimit), seed.callToAction].filter(Boolean).join('\n\n')
  },
  website: (seed) => {
    return [seed.title, seed.sourceText, keyPoints(seed), seed.callToAction].filter(Boolean).join('\n\n')
  },
}

export function resetTemplateDraft(draft: SocialDraft, seed: Seed): string {
  return CHANNEL_TEMPLATES[draft.channel](seed, draft.tone, draft.length)
}

export class TemplateDraftGeneratorService implements DraftGeneratorService {
  async generateDrafts(
    seed: Seed,
    channels: PublishingChannel[],
    tone: string,
    length: DraftLength,
    context?: DraftGenerationContext,
  ): Promise<SocialDraft[]> {
    const now = new Date().toISOString()

    return channels.map((channel, index) => ({
      id: `generated-${Date.now()}-${index}`,
      workspaceId: seed.workspaceId,
      seedId: seed.id,
      channel,
      title: seed.title,
      draftText: CHANNEL_TEMPLATES[channel](seed, tone, length),
      hashtags: [...seed.tags],
      cta: seed.callToAction,
      // Deterministic templates never guess — there is nothing to flag.
      assumptions: [],
      metadata: {},
      source: 'template' as const,
      tone,
      length,
      status: 'draft' as const,
      createdBy: context?.createdBy ?? seed.createdBy,
      createdAt: now,
      updatedAt: now,
    }))
  }
}
