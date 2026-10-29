import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LlmOutputError,
  calculateGenerationCost,
  envValue,
  extractJsonText,
  isAiConfigured,
  resolveAiModel,
  resolveLlmProvider,
  runStructuredCompletion,
  unwrapStructuredOutput,
} from './llm-provider'

const request = {
  system: 'system prompt',
  user: 'user prompt',
  toolName: 'propose_thing',
  toolDescription: 'Submit it.',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  maxTokens: 512,
}

const deepseekEnv = { DEEPSEEK_API_KEY: 'sk-test' }

function reply(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

function completion(content: string | null, extra: { finish_reason?: string; usage?: { prompt_tokens: number; completion_tokens: number } } = {}) {
  return {
    choices: [{ message: { content }, finish_reason: extra.finish_reason ?? 'stop' }],
    usage: extra.usage ?? { prompt_tokens: 100, completion_tokens: 20 },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('provider resolution', () => {
  it('is unconfigured without any key', () => {
    expect(resolveLlmProvider({})).toBeNull()
    expect(isAiConfigured({ DEEPSEEK_API_KEY: '  ' })).toBe(false)
  })

  it('prefers DeepSeek, falls back to Anthropic, and honours AI_PROVIDER', () => {
    expect(resolveLlmProvider({ DEEPSEEK_API_KEY: 'a', ANTHROPIC_API_KEY: 'b' })).toBe('deepseek')
    expect(resolveLlmProvider({ ANTHROPIC_API_KEY: 'b' })).toBe('anthropic')
    expect(resolveLlmProvider({ DEEPSEEK_API_KEY: 'a', ANTHROPIC_API_KEY: 'b', AI_PROVIDER: 'anthropic' })).toBe('anthropic')
  })

  it('does not silently switch provider when the requested one has no key', () => {
    expect(resolveLlmProvider({ ANTHROPIC_API_KEY: 'b', AI_PROVIDER: 'deepseek' })).toBeNull()
  })

  it('resolves the model per provider with overrides', () => {
    expect(resolveAiModel(deepseekEnv)).toBe('deepseek-flash')
    expect(resolveAiModel({ ...deepseekEnv, DEEPSEEK_MODEL: 'deepseek-v4-pro' })).toBe('deepseek-v4-pro')
    expect(resolveAiModel({ ANTHROPIC_API_KEY: 'b' })).toBe('claude-haiku-4-5-20251001')
  })
})

describe('calculateGenerationCost', () => {
  it('is 0 with no pricing configured', () => {
    expect(calculateGenerationCost(1_000_000, 1_000_000, {})).toBe(0)
  })

  it('uses AI_* rates, with the older ANTHROPIC_* names as a fallback', () => {
    expect(calculateGenerationCost(1_000_000, 500_000, { AI_INPUT_COST_PER_MTOK: '0.3', AI_OUTPUT_COST_PER_MTOK: '1.2' })).toBe(0.9)
    expect(calculateGenerationCost(1_000_000, 0, { ANTHROPIC_INPUT_COST_PER_MTOK: '3' })).toBe(3)
  })

  it('ignores negative or non-numeric rates', () => {
    expect(calculateGenerationCost(1_000_000, 1_000_000, { AI_INPUT_COST_PER_MTOK: '-1', AI_OUTPUT_COST_PER_MTOK: 'x' })).toBe(0)
  })
})

describe('envValue / empty env lines', () => {
  it('skips empty and whitespace values so an empty AI_* line does not hide the ANTHROPIC_* fallback', () => {
    expect(envValue('', '  ', '3')).toBe('3')
    expect(envValue(undefined, undefined)).toBeUndefined()
    expect(calculateGenerationCost(1_000_000, 0, { AI_INPUT_COST_PER_MTOK: '', ANTHROPIC_INPUT_COST_PER_MTOK: '3' })).toBe(3)
  })
})

describe('unwrapStructuredOutput', () => {
  it('unwraps a single tool-name / arguments wrapper and leaves real objects alone', () => {
    expect(unwrapStructuredOutput({ propose_thing: { ok: true } }, 'propose_thing')).toEqual({ ok: true })
    expect(unwrapStructuredOutput({ arguments: { ok: true } }, 'propose_thing')).toEqual({ ok: true })
    expect(unwrapStructuredOutput({ ok: true }, 'propose_thing')).toEqual({ ok: true })
    expect(unwrapStructuredOutput({ drafts: [1] }, 'propose_thing')).toEqual({ drafts: [1] })
    expect(unwrapStructuredOutput([1], 'propose_thing')).toEqual([1])
  })
})

describe('extractJsonText', () => {
  it('unwraps a markdown fence and leaves plain JSON alone', () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}')
  })
})

describe('runStructuredCompletion (DeepSeek)', () => {
  it('sends an OpenAI-style JSON-mode request and returns the parsed object with usage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(completion('{"ok":true}')))

    const result = await runStructuredCompletion(request, deepseekEnv)

    expect(result.output).toEqual({ ok: true })
    expect(result.usage).toEqual({ model: 'deepseek-flash', inputTokens: 100, outputTokens: 20 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-test' })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.max_tokens).toBe(512)
    expect(body.messages[0].content).toContain('system prompt')
    expect(body.messages[0].content).toContain('json')
    expect(body.messages[0].content).toContain('propose_thing')
    expect(body.messages[1]).toEqual({ role: 'user', content: 'user prompt' })
  })

  it('honours DEEPSEEK_BASE_URL and DEEPSEEK_MODEL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(completion('{"ok":true}')))
    await runStructuredCompletion(request, { ...deepseekEnv, DEEPSEEK_BASE_URL: 'https://proxy.example/v1/', DEEPSEEK_MODEL: 'm-1' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://proxy.example/v1/chat/completions')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).model).toBe('m-1')
  })

  it('accepts JSON wrapped in a code fence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(completion('```json\n{"ok":true}\n```')))
    expect((await runStructuredCompletion(request, deepseekEnv)).output).toEqual({ ok: true })
  })

  it('retries once on an empty answer and adds up the usage of both calls', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(completion('', { usage: { prompt_tokens: 100, completion_tokens: 0 } })))
      .mockResolvedValueOnce(reply(completion('{"ok":true}', { usage: { prompt_tokens: 100, completion_tokens: 20 } })))

    const result = await runStructuredCompletion(request, deepseekEnv)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.usage.inputTokens).toBe(200)
    expect(result.usage.outputTokens).toBe(20)
  })

  it('reports an unusable answer as LlmOutputError carrying the spent usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(completion('not json')))
    const error = await runStructuredCompletion(request, deepseekEnv).catch((cause) => cause)
    expect(error).toBeInstanceOf(LlmOutputError)
    expect((error as LlmOutputError).usage.outputTokens).toBe(20)
  })

  it('treats a truncated answer (finish_reason length) as an output error, not partial JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(completion('{"ok":', { finish_reason: 'length' })))
    await expect(runStructuredCompletion(request, deepseekEnv)).rejects.toBeInstanceOf(LlmOutputError)
  })

  it('gives up with LlmOutputError when both attempts are empty', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reply(completion(null)))
    await expect(runStructuredCompletion(request, deepseekEnv)).rejects.toBeInstanceOf(LlmOutputError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws a plain error (no usage) for an HTTP failure on the first call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply('{"error":{"message":"Authentication Fails"}}', 401))
    const error = await runStructuredCompletion(request, deepseekEnv).catch((cause) => cause)
    expect(error).not.toBeInstanceOf(LlmOutputError)
    expect((error as Error).message).toContain('401')
  })

  it('refuses when no provider is configured', async () => {
    await expect(runStructuredCompletion(request, {})).rejects.toThrow(/No AI provider/)
  })

  it('unwraps {"toolName": {...}} answers instead of failing a billed call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(completion('{"propose_thing":{"ok":true}}')))
    expect((await runStructuredCompletion(request, deepseekEnv)).output).toEqual({ ok: true })
  })

  it('keeps the tokens of a billed empty first attempt when the second attempt fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(completion('', { usage: { prompt_tokens: 100, completion_tokens: 0 } })))
      .mockResolvedValueOnce(reply('upstream down', 503))

    const error = await runStructuredCompletion(request, deepseekEnv).catch((cause) => cause)

    expect(error).toBeInstanceOf(LlmOutputError)
    expect((error as LlmOutputError).usage.inputTokens).toBe(100)
    expect((error as LlmOutputError).message).toContain('503')
  })

  it('does not wrap a failure of the very first attempt (nothing was billed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const error = await runStructuredCompletion(request, deepseekEnv).catch((cause) => cause)
    expect(error).not.toBeInstanceOf(LlmOutputError)
  })
})
