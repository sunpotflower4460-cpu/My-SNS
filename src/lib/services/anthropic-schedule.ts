import Anthropic from '@anthropic-ai/sdk'
import type { ScheduleExtractionContext, ScheduleProposal } from './interfaces'
import { resolveAnthropicModel } from './anthropic-draft'

// Server-only. Extracts proposed calendar events from a conversation. Like
// anthropic-reply, it reuses anthropic-draft's config/model/cost helpers and a
// forced tool call. The human approves each proposal before it lands on the
// calendar — this only proposes, it never writes an event.

export const SCHEDULE_PROPOSAL_TOOL_NAME = 'propose_schedule'

export const SCHEDULE_PROPOSAL_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    events: {
      type: 'array' as const,
      description: 'Every concrete calendar event the conversation actually agrees on or clearly proposes. Empty array if the message contains no schedulable plan.',
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const, description: 'A short Japanese title for the event (who/what).' },
          startsAt: {
            type: 'string' as const,
            description:
              'Absolute ISO 8601 date-time WITH the +09:00 offset (Asia/Tokyo), resolved from the conversation relative to the provided current time. e.g. 2026-07-21T15:00:00+09:00',
          },
          endsAt: { type: 'string' as const, description: 'Optional absolute ISO 8601 end (+09:00). Omit if unknown.' },
          allDay: { type: 'boolean' as const, description: 'True only if no specific time was given (a whole-day plan).' },
          location: { type: 'string' as const, description: 'Location if stated (e.g. オンライン, 渋谷). Omit if none.' },
          note: { type: 'string' as const, description: 'A short Japanese note on the source/any assumption (e.g. 「来週火曜」を解釈).' },
        },
        required: ['title', 'startsAt', 'allDay'],
      },
    },
  },
  required: ['events'],
}

interface RawScheduleEvent {
  title?: string
  startsAt?: string
  endsAt?: string
  allDay?: boolean
  location?: string
  note?: string
}

interface RawScheduleProposal {
  events?: RawScheduleEvent[]
}

export function buildScheduleExtractionPrompt(
  conversationText: string,
  context: ScheduleExtractionContext,
): { system: string; user: string } {
  const system = [
    'You extract concrete calendar events from a creator\'s incoming message so they can be added to a calendar.',
    'You are a proposer only — the human approves each event before it is saved. You never write to the calendar.',
    'Extract ONLY events the conversation actually agrees on or clearly proposes. Do NOT invent plans, and do NOT extract vague intentions ("そのうち会いたい") — those are not schedulable. If there is no concrete plan, return an empty events array.',
    'Resolve every relative date/time ("明日", "来週火曜15時", "今週末") to an ABSOLUTE ISO 8601 date-time with the +09:00 (Asia/Tokyo) offset, using the current time provided. Never output a relative or ambiguous time.',
    'Set allDay=true only when no specific clock time was given. Keep titles short and in Japanese.',
    'Call the propose_schedule tool exactly once.',
  ].join(' ')

  const user = [
    `Current time (Asia/Tokyo): ${context.nowJst}`,
    context.contactDisplayName ? `Conversation with: ${context.contactDisplayName}` : '',
    `\nMessage / conversation to extract events from:\n"${conversationText}"`,
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user }
}

// An ISO instant is unambiguous only with a timezone designator (Z or ±HH:MM).
const TZ_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/

/**
 * Resolves a model-supplied datetime to an absolute-instant epoch-ms. The prompt
 * asks for a +09:00 offset, but models sometimes omit it — and a naive
 * "YYYY-MM-DDTHH:mm:ss" would otherwise be parsed against the SERVER's clock
 * (UTC in prod), silently shifting a JST-intended time by 9h. Since the whole
 * extraction context is Asia/Tokyo, a missing offset is treated as +09:00 (what
 * the prompt asked for) rather than left to drift. Anything still unparseable
 * (a relative phrase, a bare date) becomes NaN and is dropped by the caller.
 */
function toInstantMs(value: string | undefined): number {
  if (!value) return NaN
  const normalized = TZ_OFFSET_RE.test(value) ? value : `${value}+09:00`
  return new Date(normalized).getTime()
}

/**
 * Parses + validates the tool output. Drops any event whose startsAt is not a
 * real date (the model must return an absolute instant); normalizes to UTC ISO.
 * An empty result is valid — most messages contain no schedulable plan.
 */
export function parseScheduleProposals(toolInput: unknown): ScheduleProposal[] {
  const raw = toolInput as RawScheduleProposal | undefined
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) {
    throw new Error('The model did not return a valid schedule proposal.')
  }

  const proposals: ScheduleProposal[] = []
  for (const event of raw.events) {
    const title = event.title?.trim()
    const startsMs = toInstantMs(event.startsAt)
    if (!title || Number.isNaN(startsMs)) continue // skip anything without a title or a resolvable start

    const endsMs = toInstantMs(event.endsAt)
    // Drop an end that isn't a real date or precedes the start.
    const endsAt = !Number.isNaN(endsMs) && endsMs >= startsMs ? new Date(endsMs).toISOString() : undefined

    proposals.push({
      title,
      startsAt: new Date(startsMs).toISOString(),
      endsAt,
      allDay: Boolean(event.allDay),
      location: event.location?.trim() || undefined,
      note: event.note?.trim() || undefined,
    })
  }

  return proposals
}

export interface AnthropicScheduleResult {
  proposals: ScheduleProposal[]
  model: string
  inputTokens: number
  outputTokens: number
}

export interface AnthropicUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

/** Thrown when the Anthropic call succeeded (and was billed) but the response couldn't be parsed — carries usage so the caller can still record spend. */
export class AnthropicScheduleGenerationError extends Error {
  usage: AnthropicUsage

  constructor(message: string, usage: AnthropicUsage) {
    super(message)
    this.name = 'AnthropicScheduleGenerationError'
    this.usage = usage
  }
}

export async function extractScheduleWithAnthropic(
  conversationText: string,
  context: ScheduleExtractionContext,
): Promise<AnthropicScheduleResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }

  const model = resolveAnthropicModel()
  const { system, user } = buildScheduleExtractionPrompt(conversationText, context)
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [
      {
        name: SCHEDULE_PROPOSAL_TOOL_NAME,
        description: 'Submit the extracted calendar events.',
        input_schema: SCHEDULE_PROPOSAL_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: SCHEDULE_PROPOSAL_TOOL_NAME },
  })

  const usage: AnthropicUsage = {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AnthropicScheduleGenerationError('The model did not call the schedule tool.', usage)
  }

  let proposals: ScheduleProposal[]
  try {
    proposals = parseScheduleProposals(toolUse.input)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The model returned an unusable response.'
    throw new AnthropicScheduleGenerationError(message, usage)
  }

  return { proposals, ...usage }
}
