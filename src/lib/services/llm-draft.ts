import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { PublishingChannel, Seed, SocialDraft } from '@/lib/domain/types'
import { isValidThumbnailHook, shortenThumbnailHook } from '@/lib/media/thumbnail-hook'
import { keepFactualAssumptions } from './draft-assumptions'
import {
  formatDraftStyleExamplesForPrompt,
  freezeAiOriginalSnapshot,
} from './draft-style-learning'
import type { DraftGenerationContext, DraftGeneratorService } from './interfaces'
import { LlmOutputError, runStructuredCompletion, type LlmUsage } from './llm-provider'

// Server-only. Never import this file from client components — it calls the
// configured LLM provider (see llm-provider.ts).

type DraftLength = 'short' | 'medium' | 'long'

export const DRAFT_PROPOSAL_TOOL_NAME = 'propose_channel_drafts'

export const DRAFT_PROPOSAL_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    drafts: {
      type: 'array' as const,
      description: 'One proposal per requested channel. Every requested channel must appear exactly once.',
      items: {
        type: 'object' as const,
        properties: {
          channel: { type: 'string' as const, description: 'The publishing channel this proposal is for.' },
          title: { type: 'string' as const, description: 'Optional headline/title, when the channel uses one.' },
          body: { type: 'string' as const, description: 'The main proposed copy for this channel.' },
          hashtags: { type: 'array' as const, items: { type: 'string' as const } },
          cta: { type: 'string' as const, description: 'Proposed call to action, if any.' },
          assumptions: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description:
              'Guessed facts that are not in the Seed or Brand Profile (a date, a name, a price, a claim). Empty array if you invented no facts. Do not list copy-editing, channel formatting, or thumbnail/cover hook text.',
          },
          metadata: {
            type: 'object' as const,
            description:
              'Channel-specific extras. youtube: {description, chapters?: string[], thumbnailHook?: string}. thumbnailHook MUST be 3–8 Japanese characters of CTR hook text (not a sentence, not thumbnailTextIdeas). x: {thread?: string[]}. instagram/tiktok: {coverText?, hook?}. note: {markdown, eyecatchIdeas?: string[]}.',
          },
        },
        required: ['channel', 'body', 'hashtags', 'assumptions'],
      },
    },
  },
  required: ['drafts'],
}

interface RawDraftProposal {
  channel: string
  title?: string
  body: string
  hashtags?: string[]
  cta?: string
  assumptions?: string[]
  metadata?: Record<string, unknown>
}

export function buildDraftGenerationPrompt(
  seed: Seed,
  channels: PublishingChannel[],
  tone: string,
  length: DraftLength,
  brandProfile?: DraftGenerationContext['brandProfile'],
  styleExamples?: DraftGenerationContext['styleExamples'],
  styleTendencies?: DraftGenerationContext['styleTendencies'],
): { system: string; user: string } {
  const channelGuidance = channels
    .map((channel) => `- ${channel}: ${PUBLISHING_CHANNEL_CONFIG[channel].description}`)
    .join('\n')

  const system = [
    'You are a proposal writer for a creator\'s social publishing workspace.',
    'You propose channel-specific copy from a single Seed (the raw source of truth). You are never the final decision maker.',
    'Never invent facts, dates, names, prices, or claims that are not present in the Seed or Brand Profile.',
    'If you must fill a factual gap to write a usable draft, make the smallest reasonable assumption and record that fact-gap in `assumptions`. Do not silently invent facts.',
    '`assumptions` is only for guessed facts. Do not record copy-editing, tone/length adaptation, channel formatting, or thumbnail/cover hook text there. Proofreading the creator\'s own words is not an assumption — listing it makes their work look like an AI guess.',
    'Respect the Brand Profile: preferred terms, avoided terms/claims, voice traits, and values are constraints, not suggestions.',
    'If past-edit examples are provided, they show how this specific creator tends to change your proposals — write closer to the "creator approved" style next time, without copying the example\'s facts into an unrelated Seed. Observed tendencies are style hints derived from those edits; they never override Brand Profile constraints or Seed facts, and they are not new facts to invent.',
    'For YouTube, metadata.thumbnailHook is a 3–8 character Japanese CTR hook burned into a real thumbnail image, preferably taken from the Seed title or key points. Never put a paragraph or slogan list there. Do not record the hook in `assumptions`.',
    'Call the propose_channel_drafts tool exactly once with one proposal per requested channel.',
  ].join(' ')

  const styleExamplesBlock = formatDraftStyleExamplesForPrompt(styleExamples ?? [])
  const styleTendenciesBlock =
    styleTendencies && styleTendencies.length > 0
      ? ['Observed editing tendencies (style only; do not copy facts from past Seeds):', ...styleTendencies.map((note) => `- ${note}`)].join('\n')
      : ''

  const brandProfileBlock = brandProfile
    ? [
        `Brand Profile: ${brandProfile.name}`,
        brandProfile.description ? `Purpose/worldview: ${brandProfile.description}` : '',
        brandProfile.audience ? `Core audience: ${brandProfile.audience}` : '',
        brandProfile.voiceTraits.length ? `Voice traits: ${brandProfile.voiceTraits.join(', ')}` : '',
        brandProfile.values.length ? `Values: ${brandProfile.values.join(', ')}` : '',
        brandProfile.preferredTerms.length ? `Preferred terms: ${brandProfile.preferredTerms.join(', ')}` : '',
        brandProfile.avoidedTerms.length ? `Avoided terms/claims: ${brandProfile.avoidedTerms.join(', ')}` : '',
        brandProfile.defaultCallToAction ? `Default CTA: ${brandProfile.defaultCallToAction}` : '',
      ].filter(Boolean).join('\n')
    : 'No Brand Profile is set for this workspace.'

  const user = [
    brandProfileBlock,
    '',
    `Seed title: ${seed.title}`,
    seed.sourceText ? `Source text: ${seed.sourceText}` : 'Source text: (none provided)',
    seed.goal ? `Goal: ${seed.goal}` : '',
    seed.audience ? `Audience override: ${seed.audience}` : '',
    seed.keyPoints.length ? `Key points:\n${seed.keyPoints.map((point) => `- ${point}`).join('\n')}` : '',
    seed.callToAction ? `CTA override: ${seed.callToAction}` : '',
    '',
    `Requested tone: ${tone}. Requested length: ${length}.`,
    'Channels to propose (with per-channel intent):',
    channelGuidance,
    styleExamplesBlock ? `\n${styleExamplesBlock}` : '',
    styleTendenciesBlock ? `\n${styleTendenciesBlock}` : '',
  ].filter(Boolean).join('\n')

  return { system, user }
}

export function parseDraftProposals(
  toolInput: unknown,
  seed: Seed,
  channels: PublishingChannel[],
  tone: string,
  length: DraftLength,
  context?: DraftGenerationContext,
): SocialDraft[] {
  const input = toolInput as { drafts?: RawDraftProposal[] } | undefined
  const rawDrafts = input?.drafts

  if (!Array.isArray(rawDrafts)) {
    throw new Error('The model did not return a valid drafts array.')
  }

  const byChannel = new Map<string, RawDraftProposal>()
  for (const raw of rawDrafts) {
    if (raw?.channel) byChannel.set(raw.channel, raw)
  }

  const missing = channels.filter((channel) => !byChannel.has(channel))
  if (missing.length > 0) {
    throw new Error(`The model did not propose a draft for: ${missing.join(', ')}.`)
  }

  const now = new Date().toISOString()

  return channels.map((channel, index) => {
    const raw = byChannel.get(channel) as RawDraftProposal
    if (!raw.body?.trim()) {
      throw new Error(`The model returned an empty body for ${channel}.`)
    }

    const metadata: Record<string, unknown> = { ...(raw.metadata ?? {}) }
    const assumptions = keepFactualAssumptions(raw.assumptions)
    if (channel === 'youtube') {
      const proposed = typeof metadata.thumbnailHook === 'string' ? metadata.thumbnailHook : ''
      if (proposed && isValidThumbnailHook(proposed.trim())) {
        metadata.thumbnailHook = proposed.trim().replace(/\s+/g, '')
      } else if (proposed) {
        const looksLikeParagraph = proposed.includes(' ') || proposed.replace(/\s+/g, '').length > 16
        const shortened = looksLikeParagraph ? '' : shortenThumbnailHook(proposed)
        if (shortened) {
          metadata.thumbnailHook = shortened
        } else {
          delete metadata.thumbnailHook
        }
      }
    }

    const title = raw.title?.trim() || undefined
    const body = raw.body.trim()
    const hashtags = raw.hashtags ?? []
    const cta = raw.cta?.trim() || undefined

    return {
      id: `generated-${Date.now()}-${index}`,
      workspaceId: seed.workspaceId,
      seedId: seed.id,
      channel,
      title,
      draftText: body,
      hashtags,
      cta,
      assumptions,
      metadata,
      source: 'ai' as const,
      tone,
      length,
      status: 'draft' as const,
      createdBy: context?.createdBy ?? seed.createdBy,
      createdAt: now,
      updatedAt: now,
      aiOriginalSnapshot: freezeAiOriginalSnapshot({ title, body, hashtags, cta }),
    }
  })
}

export interface AiGenerationResult {
  drafts: SocialDraft[]
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Thrown when the provider call itself succeeded (and was billed) but the
 * response could not be turned into valid drafts. Carries `usage` so the
 * caller can still record what was actually spent instead of losing it.
 */
export class AiDraftGenerationError extends Error {
  usage: LlmUsage

  constructor(message: string, usage: LlmUsage) {
    super(message)
    this.name = 'AiDraftGenerationError'
    this.usage = usage
  }
}

export async function generateChannelDraftsWithAi(
  seed: Seed,
  channels: PublishingChannel[],
  tone: string,
  length: DraftLength,
  context?: DraftGenerationContext,
): Promise<AiGenerationResult> {
  const { system, user } = buildDraftGenerationPrompt(
    seed,
    channels,
    tone,
    length,
    context?.brandProfile,
    context?.styleExamples,
    context?.styleTendencies,
  )

  let result
  try {
    result = await runStructuredCompletion({
      system,
      user,
      toolName: DRAFT_PROPOSAL_TOOL_NAME,
      toolDescription: 'Submit the proposed channel drafts.',
      schema: DRAFT_PROPOSAL_TOOL_SCHEMA,
      maxTokens: 4096,
    })
  } catch (cause) {
    if (cause instanceof LlmOutputError) throw new AiDraftGenerationError(cause.message, cause.usage)
    throw cause
  }

  let drafts: SocialDraft[]
  try {
    drafts = parseDraftProposals(result.output, seed, channels, tone, length, context)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The model returned an unusable response.'
    throw new AiDraftGenerationError(message, result.usage)
  }

  return { drafts, ...result.usage }
}

export class AiDraftGeneratorService implements DraftGeneratorService {
  async generateDrafts(
    seed: Seed,
    channels: PublishingChannel[],
    tone: string,
    length: DraftLength,
    context?: DraftGenerationContext,
  ): Promise<SocialDraft[]> {
    const result = await generateChannelDraftsWithAi(seed, channels, tone, length, context)
    return result.drafts
  }
}
