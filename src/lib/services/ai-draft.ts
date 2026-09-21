import type { PublishingChannel, Seed, SocialDraft } from '@/lib/domain/types'
import type { DraftGenerationContext, DraftGeneratorService } from './interfaces'

type DraftLength = 'short' | 'medium' | 'long'

function truncate(text: string, limit: number): string {
  const normalized = text.trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function keyPoints(seed: Seed): string {
  return seed.keyPoints.map((point) => `- ${point}`).join('\n')
}

// The body of a template draft holds only the writing. Title, CTA and hashtags
// are stored as their own fields on the draft, and the publish handoff
// (formatRevisionForHandoff) appends the CTA and hashtags — and prepends the
// title for note / YouTube / website / Facebook. Repeating them here would make
// every copied or shared post say them twice. The channels whose handoff does
// NOT add a title (Instagram, X, TikTok, Threads, LINE) keep it as a first line.
const X_POST_LIMIT = 280

const CHANNEL_TEMPLATES: Record<PublishingChannel, (seed: Seed, tone: string, length: DraftLength) => string> = {
  instagram: (seed, _tone, length) => {
    const sourceLimit = length === 'short' ? 120 : length === 'medium' ? 360 : 900
    return [seed.title, truncate(seed.sourceText ?? '', sourceLimit)].filter(Boolean).join('\n\n')
  },
  x: (seed) => {
    // Leave room for what the handoff appends (CTA + hashtags, each after a
    // blank line) so the final post still fits in one X post.
    const hashtagText = seed.tags.slice(0, 2).map((tag) => `#${tag}`).join(' ')
    const appended = [seed.callToAction?.trim(), hashtagText].filter(Boolean)
    const reserved = appended.reduce((total, part) => total + 2 + (part?.length ?? 0), 0)
    const body = [seed.title, seed.sourceText].filter(Boolean).join(' — ')
    return truncate(body, Math.max(0, X_POST_LIMIT - reserved))
  },
  youtube: (seed) => {
    return [seed.sourceText, keyPoints(seed)].filter(Boolean).join('\n\n')
  },
  note: (seed) => {
    return [seed.sourceText, keyPoints(seed)].filter(Boolean).join('\n\n')
  },
  threads: (seed, _tone, length) => {
    const sourceLimit = length === 'short' ? 180 : length === 'medium' ? 360 : 700
    return [seed.title, truncate(seed.sourceText ?? '', sourceLimit)].filter(Boolean).join('\n\n')
  },
  tiktok: (seed) => {
    return [seed.title, truncate(seed.sourceText ?? '', 180)].filter(Boolean).join('\n\n')
  },
  facebook: (seed, _tone, length) => {
    const sourceLimit = length === 'short' ? 180 : length === 'medium' ? 500 : 1200
    return [truncate(seed.sourceText ?? '', sourceLimit)].filter(Boolean).join('\n\n')
  },
  website: (seed) => {
    return [seed.sourceText, keyPoints(seed)].filter(Boolean).join('\n\n')
  },
  // LINE is a messaging platform, never a publishing channel — this entry only
  // satisfies the exhaustive Record<PublishingChannel, …> and is never reached
  // via the Seed channel picker (CORE_PUBLISHING_CHANNELS excludes it).
  line: (seed) => {
    return [seed.title, seed.sourceText].filter(Boolean).join('\n\n')
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
      // X's handoff appends every hashtag on the draft, and the body was sized
      // for two — keep the two in agreement.
      hashtags: channel === 'x' ? seed.tags.slice(0, 2) : [...seed.tags],
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
