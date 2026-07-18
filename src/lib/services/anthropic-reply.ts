import Anthropic from '@anthropic-ai/sdk'
import type { ReplyGenerationContext, ReplyGeneratorService, ReplyProposal } from './interfaces'
import { resolveAnthropicModel } from './anthropic-draft'

// Server-only. Never import from a client component — it reads ANTHROPIC_API_KEY
// and talks to the Anthropic API. Reuses anthropic-draft's config/model/cost
// helpers (isAnthropicConfigured/resolveAnthropicModel/calculateGenerationCost)
// so there is one place that owns those; only the tool schema + prompt differ.

const PRIORITIES = ['high', 'normal', 'low'] as const
type Priority = (typeof PRIORITIES)[number]

export const REPLY_PROPOSAL_TOOL_NAME = 'propose_reply'

export const REPLY_PROPOSAL_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string' as const,
      description: 'A soft, clear Japanese summary of what the sender is asking or saying — what the creator needs to know at a glance.',
    },
    reply: {
      type: 'string' as const,
      description: "A proposed reply written in the creator's voice. The human approves (and may edit) before it is ever sent.",
    },
    tone: { type: 'string' as const, description: 'One or two words describing the tone you wrote in (e.g. 落ち着いた, 丁寧).' },
    assumptions: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description:
        'Every gap you filled with a guess instead of a confirmed fact (a date, a name, an intent you inferred). Empty array if you made no assumptions.',
    },
    priority: {
      type: 'string' as const,
      enum: [...PRIORITIES],
      description: 'How urgently this message needs a reply: high (time-sensitive/upset/opportunity), normal, or low (FYI/no action).',
    },
  },
  required: ['summary', 'reply', 'tone', 'assumptions', 'priority'],
}

interface RawReplyProposal {
  summary?: string
  reply?: string
  tone?: string
  assumptions?: string[]
  priority?: string
}

export function buildReplyGenerationPrompt(
  inboundText: string,
  context?: ReplyGenerationContext,
): { system: string; user: string } {
  const system = [
    "You are a messaging concierge for a creator. You draft replies to incoming direct messages in the creator's own voice.",
    'You are a proposer, never the agent — the human reviews and approves before anything is sent. You never send anything yourself.',
    'Never invent facts, commitments, dates, prices, or promises that are not in the message or the Brand Profile. If you must fill a gap to write a usable reply, make the smallest reasonable assumption and record it in `assumptions`. Do not silently guess.',
    'Respect the Brand Profile: preferred terms, avoided terms/claims, voice traits, and values are constraints, not suggestions.',
    'Summarize what the sender is asking softly and clearly (`summary`), in Japanese, so the creator understands it at a glance.',
    'Judge how urgently a reply is needed and set `priority` accordingly.',
    'If past-edit examples are provided, they show how this creator tends to change your proposals — write closer to the "creator approved" style, without copying the example\'s facts.',
    'Call the propose_reply tool exactly once.',
  ].join(' ')

  const brandProfile = context?.brandProfile
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
      ]
        .filter(Boolean)
        .join('\n')
    : 'No Brand Profile is set for this workspace.'

  const styleExamples = context?.styleExamples
  const styleExamplesBlock =
    styleExamples && styleExamples.length > 0
      ? [
          'Past edits this creator made to your reply proposals (learn the pattern, do not copy the content):',
          ...styleExamples.map(
            (example, index) =>
              `${index + 1}. Inbound: "${example.inbound}"\n   AI proposed: "${example.aiProposed}"\n   Creator sent: "${example.humanApproved}"`,
          ),
        ].join('\n')
      : ''

  const recentBlock =
    context?.recentMessages && context.recentMessages.length > 0
      ? `Recent messages in this thread (oldest first):\n${context.recentMessages.map((m) => `- ${m}`).join('\n')}`
      : ''

  const user = [
    brandProfileBlock,
    context?.contactDisplayName ? `\nContact: ${context.contactDisplayName}` : '',
    recentBlock ? `\n${recentBlock}` : '',
    `\nIncoming message to reply to:\n"${inboundText}"`,
    styleExamplesBlock ? `\n${styleExamplesBlock}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user }
}

export function parseReplyProposal(toolInput: unknown): ReplyProposal {
  const raw = toolInput as RawReplyProposal | undefined
  if (!raw || typeof raw !== 'object') {
    throw new Error('The model did not return a valid reply proposal.')
  }
  if (!raw.reply?.trim()) {
    throw new Error('The model returned an empty reply.')
  }
  if (!raw.summary?.trim()) {
    throw new Error('The model returned an empty summary.')
  }

  const priority: Priority = PRIORITIES.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'normal'

  return {
    summary: raw.summary.trim(),
    reply: raw.reply.trim(),
    tone: raw.tone?.trim() || 'calm',
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.filter((a): a is string => typeof a === 'string') : [],
    priority,
  }
}

export interface AnthropicReplyResult {
  proposal: ReplyProposal
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
 * Thrown when the Anthropic call succeeded (and was billed) but the response
 * could not be turned into a valid proposal. Carries `usage` so the caller can
 * still record what was actually spent instead of losing it — mirrors
 * anthropic-draft's AnthropicGenerationError.
 */
export class AnthropicReplyGenerationError extends Error {
  usage: AnthropicUsage

  constructor(message: string, usage: AnthropicUsage) {
    super(message)
    this.name = 'AnthropicReplyGenerationError'
    this.usage = usage
  }
}

export async function generateReplyWithAnthropic(
  inboundText: string,
  context?: ReplyGenerationContext,
): Promise<AnthropicReplyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }

  const model = resolveAnthropicModel()
  const { system, user } = buildReplyGenerationPrompt(inboundText, context)
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [
      {
        name: REPLY_PROPOSAL_TOOL_NAME,
        description: 'Submit the proposed reply.',
        input_schema: REPLY_PROPOSAL_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: REPLY_PROPOSAL_TOOL_NAME },
  })

  const usage: AnthropicUsage = {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AnthropicReplyGenerationError('The model did not call the reply tool.', usage)
  }

  let proposal: ReplyProposal
  try {
    proposal = parseReplyProposal(toolUse.input)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The model returned an unusable response.'
    throw new AnthropicReplyGenerationError(message, usage)
  }

  return { proposal, ...usage }
}

export class AnthropicReplyGeneratorService implements ReplyGeneratorService {
  async generateReply(inboundText: string, context?: ReplyGenerationContext): Promise<ReplyProposal> {
    const result = await generateReplyWithAnthropic(inboundText, context)
    return result.proposal
  }
}
