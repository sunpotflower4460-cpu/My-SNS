import Anthropic from '@anthropic-ai/sdk'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { PublishingChannel, Seed, SocialDraft } from '@/lib/domain/types'
import type { DraftGenerationContext, DraftGeneratorService } from './interfaces'

// Server-only. Never import this file from client components — it reads
// ANTHROPIC_API_KEY and talks to the Anthropic API directly.

type DraftLength = 'short' | 'medium' | 'long'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export function resolveAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL
}

/**
 * Approximate USD cost from token counts. Anthropic's published per-model
 * pricing changes over time, so this project does not hardcode it — set
 * ANTHROPIC_INPUT_COST_PER_MTOK / ANTHROPIC_OUTPUT_COST_PER_MTOK (USD per
 * million tokens) to get a real estimate. Token counts themselves (the
 * ground truth) are always recorded even when cost is left at 0.
 */
export function calculateGenerationCost(inputTokens: number, outputTokens: number): number {
  const inputRate = Number(process.env.ANTHROPIC_INPUT_COST_PER_MTOK ?? 0)
  const outputRate = Number(process.env.ANTHROPIC_OUTPUT_COST_PER_MTOK ?? 0)
  const safeInputRate = Number.isFinite(inputRate) && inputRate >= 0 ? inputRate : 0
  const safeOutputRate = Number.isFinite(outputRate) && outputRate >= 0 ? outputRate : 0

  const cost = (inputTokens / 1_000_000) * safeInputRate + (outputTokens / 1_000_000) * safeOutputRate
  return Math.round(cost * 100_000) / 100_000
}

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
              'Every gap you filled with a guess instead of a confirmed Seed or Brand Profile fact. Empty array if you made no assumptions.',
          },
          metadata: {
            type: 'object' as const,
            description:
              'Channel-specific extras. youtube: {description, chapters?: string[], thumbnailTextIdeas?: string[]}. x: {thread?: string[]}. instagram/tiktok: {coverText?, hook?}. note: {markdown, eyecatchIdeas?: string[]}.',
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
): { system: string; user: string } {
  const channelGuidance = channels
    .map((channel) => `- ${channel}: ${PUBLISHING_CHANNEL_CONFIG[channel].description}`)
    .join('\n')

  const system = [
    'You are a proposal writer for a creator\'s social publishing workspace.',
    'You propose channel-specific copy from a single Seed (the raw source of truth). You are never the final decision maker.',
    'Never invent facts, dates, names, prices, or claims that are not present in the Seed or Brand Profile.',
    'If you must fill a gap to write a usable draft, make the smallest reasonable assumption and record it in `assumptions`. Do not silently guess.',
    'Respect the Brand Profile: preferred terms, avoided terms/claims, voice traits, and values are constraints, not suggestions.',
    'If past-edit examples are provided, they show how this specific creator tends to change your proposals — write closer to the "creator approved" style next time, without copying the example\'s facts into an unrelated Seed.',
    'Call the propose_channel_drafts tool exactly once with one proposal per requested channel.',
  ].join(' ')

  const styleExamplesBlock =
    styleExamples && styleExamples.length > 0
      ? [
          'Past edits this creator made to AI proposals (learn the pattern, do not copy the content verbatim):',
          ...styleExamples.map(
            (example, index) =>
              `${index + 1}. [${example.channel}] AI proposed: "${example.aiProposed}"\n   Creator approved: "${example.humanApproved}"`,
          ),
        ].join('\n')
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

    return {
      id: `generated-${Date.now()}-${index}`,
      workspaceId: seed.workspaceId,
      seedId: seed.id,
      channel,
      title: raw.title?.trim() || undefined,
      draftText: raw.body.trim(),
      hashtags: raw.hashtags ?? [],
      cta: raw.cta?.trim() || undefined,
      assumptions: raw.assumptions ?? [],
      metadata: raw.metadata ?? {},
      source: 'ai' as const,
      tone,
      length,
      status: 'draft' as const,
      createdBy: context?.createdBy ?? seed.createdBy,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export interface AnthropicGenerationResult {
  drafts: SocialDraft[]
  model: string
  inputTokens: number
  outputTokens: number
}

export interface AnthropicUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Thrown when the Anthropic call itself succeeded (and was billed) but the
 * response could not be turned into valid drafts. Carries `usage` so the
 * caller can still record what was actually spent instead of losing it.
 */
export class AnthropicGenerationError extends Error {
  usage: AnthropicUsage

  constructor(message: string, usage: AnthropicUsage) {
    super(message)
    this.name = 'AnthropicGenerationError'
    this.usage = usage
  }
}

export async function generateChannelDraftsWithAnthropic(
  seed: Seed,
  channels: PublishingChannel[],
  tone: string,
  length: DraftLength,
  context?: DraftGenerationContext,
): Promise<AnthropicGenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }

  const model = resolveAnthropicModel()
  const { system, user } = buildDraftGenerationPrompt(seed, channels, tone, length, context?.brandProfile, context?.styleExamples)
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [
      {
        name: DRAFT_PROPOSAL_TOOL_NAME,
        description: 'Submit the proposed channel drafts.',
        input_schema: DRAFT_PROPOSAL_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: DRAFT_PROPOSAL_TOOL_NAME },
  })

  const usage: AnthropicUsage = {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AnthropicGenerationError('The model did not call the drafts tool.', usage)
  }

  let drafts: SocialDraft[]
  try {
    drafts = parseDraftProposals(toolUse.input, seed, channels, tone, length, context)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The model returned an unusable response.'
    throw new AnthropicGenerationError(message, usage)
  }

  return { drafts, ...usage }
}

export class AnthropicDraftGeneratorService implements DraftGeneratorService {
  async generateDrafts(
    seed: Seed,
    channels: PublishingChannel[],
    tone: string,
    length: DraftLength,
    context?: DraftGenerationContext,
  ): Promise<SocialDraft[]> {
    const result = await generateChannelDraftsWithAnthropic(seed, channels, tone, length, context)
    return result.drafts
  }
}
