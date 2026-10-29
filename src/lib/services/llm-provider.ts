import Anthropic from '@anthropic-ai/sdk'

// Server-only. Never import from client components — it reads API keys.
//
// One place that knows which LLM provider is configured and how to ask it for
// a structured (JSON) answer. The draft, reply and schedule services build
// their prompts and validate the result; they do not talk to a provider.
//
// DeepSeek (OpenAI-compatible Chat Completions, JSON mode) is the default.
// Anthropic (forced tool use) remains available.

export type LlmProvider = 'deepseek' | 'anthropic'

type Env = Record<string, string | undefined>

const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash'
const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/** Total time one structured call may take, including the one empty-answer retry. */
const DEFAULT_TIMEOUT_MS = 40_000

export interface LlmUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * The provider call itself succeeded (and was billed) but the answer could not
 * be used — empty, cut off, or not JSON. Carries `usage` so the caller can
 * still record what was spent instead of losing it.
 */
export class LlmOutputError extends Error {
  usage: LlmUsage

  constructor(message: string, usage: LlmUsage) {
    super(message)
    this.name = 'LlmOutputError'
    this.usage = usage
  }
}

/**
 * Which provider to use. AI_PROVIDER wins when it names a provider whose key is
 * present; otherwise DeepSeek if its key is set, then Anthropic. Null when no
 * key is configured — callers then fall back to templates and say so.
 */
export function resolveLlmProvider(env: Env = process.env): LlmProvider | null {
  const hasDeepseek = Boolean(env.DEEPSEEK_API_KEY?.trim())
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY?.trim())
  const requested = env.AI_PROVIDER?.trim().toLowerCase()

  if (requested === 'deepseek') return hasDeepseek ? 'deepseek' : null
  if (requested === 'anthropic') return hasAnthropic ? 'anthropic' : null
  if (hasDeepseek) return 'deepseek'
  if (hasAnthropic) return 'anthropic'
  return null
}

export function isAiConfigured(env: Env = process.env): boolean {
  return resolveLlmProvider(env) !== null
}

export function resolveAiModel(env: Env = process.env, provider = resolveLlmProvider(env)): string {
  if (provider === 'anthropic') return env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL
  return env.DEEPSEEK_MODEL?.trim() || DEEPSEEK_DEFAULT_MODEL
}

/** First non-empty value: an empty `AI_X=` line in .env must not shadow the older `ANTHROPIC_X`. */
export function envValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function nonNegativeNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Approximate USD cost from token counts. Provider prices change (DeepSeek's
 * also vary by time of day), so nothing is hardcoded: set AI_INPUT_COST_PER_MTOK
 * / AI_OUTPUT_COST_PER_MTOK (USD per million tokens; the older ANTHROPIC_* names
 * still work) to get an estimate. Token counts — the ground truth — are always
 * recorded even when cost is left at 0.
 */
export function calculateGenerationCost(inputTokens: number, outputTokens: number, env: Env = process.env): number {
  const inputRate = nonNegativeNumber(envValue(env.AI_INPUT_COST_PER_MTOK, env.ANTHROPIC_INPUT_COST_PER_MTOK))
  const outputRate = nonNegativeNumber(envValue(env.AI_OUTPUT_COST_PER_MTOK, env.ANTHROPIC_OUTPUT_COST_PER_MTOK))
  const cost = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate
  return Math.round(cost * 100_000) / 100_000
}

export interface StructuredRequest {
  system: string
  user: string
  /** Name of the structure being requested (also the Anthropic tool name). */
  toolName: string
  toolDescription: string
  /** JSON Schema of the expected object. */
  schema: object
  maxTokens: number
  timeoutMs?: number
}

export interface StructuredResult {
  output: unknown
  usage: LlmUsage
}

/** Text of a JSON reply that may be wrapped in a markdown fence. */
export function extractJsonText(content: string): string {
  const trimmed = content.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

/**
 * A model told to "return the tool's arguments" sometimes wraps them anyway —
 * {"propose_reply": {...}} or {"arguments": {...}}. Accept that shape rather
 * than fail a billed call over it.
 */
export function unwrapStructuredOutput(output: unknown, toolName: string): unknown {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output
  const keys = Object.keys(output)
  if (keys.length !== 1) return output
  const [key] = keys
  const inner = (output as Record<string, unknown>)[key]
  const isWrapperKey = key === toolName || key === 'arguments' || key === 'input' || key === 'parameters'
  return isWrapperKey && inner && typeof inner === 'object' && !Array.isArray(inner) ? inner : output
}

interface DeepseekResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

async function runDeepseek(request: StructuredRequest, env: Env): Promise<StructuredResult> {
  const apiKey = env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured.')

  const model = resolveAiModel(env, 'deepseek')
  const baseUrl = (env.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const system = [
    request.system,
    '',
    // JSON mode needs the word "json" in the prompt, and there is no tool here.
    // The base prompt's "call the tool" wording only describes what to produce.
    `Output format (this overrides any instruction above about calling a tool): there is no tool to call. Reply with ONLY one valid json object whose top-level keys are exactly the properties of the JSON Schema below (do not wrap it in another key such as "${request.toolName}" or "arguments"). No prose, no markdown fences.`,
    `JSON Schema: ${JSON.stringify(request.schema)}`,
  ].join('\n')

  const deadline = Date.now() + (request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let inputTokens = 0
  let outputTokens = 0
  const usage = (): LlmUsage => ({ model, inputTokens, outputTokens })

  // JSON mode can occasionally answer with empty content; one more try is
  // cheap. Both attempts share one deadline so the caller's route budget holds.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now()
    if (remaining <= 1_000) break

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: request.user },
          ],
          response_format: { type: 'json_object' },
          max_tokens: request.maxTokens,
          // Reasoning tokens would be billed and slow the reply; a structured
          // rewrite does not need them.
          thinking: { type: 'disabled' },
          stream: false,
        }),
        signal: AbortSignal.timeout(remaining),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`DeepSeek API error (${response.status}): ${detail.slice(0, 300)}`)
      }

      const body = (await response.json()) as DeepseekResponse
      inputTokens += body.usage?.prompt_tokens ?? 0
      outputTokens += body.usage?.completion_tokens ?? 0

      const choice = body.choices?.[0]
      const content = choice?.message?.content?.trim() ?? ''
      if (choice?.finish_reason === 'length') {
        throw new LlmOutputError('The model ran out of output space before finishing.', usage())
      }
      if (!content) continue

      let parsed: unknown
      try {
        parsed = JSON.parse(extractJsonText(content))
      } catch {
        throw new LlmOutputError('The model did not return valid JSON.', usage())
      }
      return { output: unwrapStructuredOutput(parsed, request.toolName), usage: usage() }
    } catch (cause) {
      // A first attempt that already came back (and was billed) must not lose its
      // tokens because the second one failed: report them with the failure.
      if (!(cause instanceof LlmOutputError) && inputTokens + outputTokens > 0) {
        throw new LlmOutputError(cause instanceof Error ? cause.message : 'The provider call failed.', usage())
      }
      throw cause
    }
  }

  throw new LlmOutputError('The model returned an empty response.', usage())
}

async function runAnthropic(request: StructuredRequest, env: Env): Promise<StructuredResult> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.')

  const model = resolveAiModel(env, 'anthropic')
  // One attempt, capped under the route's maxDuration: a retry would push the
  // total past it, and a hard kill skips the budget-claim release.
  const client = new Anthropic({ apiKey, timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxRetries: 0 })

  const response = await client.messages.create({
    model,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: [{ role: 'user', content: request.user }],
    tools: [
      {
        name: request.toolName,
        description: request.toolDescription,
        input_schema: request.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: request.toolName },
  })

  const usage: LlmUsage = {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new LlmOutputError('The model did not call the requested tool.', usage)
  }
  return { output: toolUse.input, usage }
}

/**
 * Ask the configured provider for one structured object. Throws a plain Error
 * for transport / API failures (nothing usable was billed) and LlmOutputError
 * when the call worked but the answer is unusable (usage attached).
 */
export async function runStructuredCompletion(request: StructuredRequest, env: Env = process.env): Promise<StructuredResult> {
  const provider = resolveLlmProvider(env)
  if (provider === 'deepseek') return runDeepseek(request, env)
  if (provider === 'anthropic') return runAnthropic(request, env)
  throw new Error('No AI provider is configured (set DEEPSEEK_API_KEY).')
}
