import { describe, expect, it } from 'vitest'
import { LlmOutputError } from './llm-provider'
import { describeAiFailure, getAiStatus } from './llm-status'

describe('getAiStatus', () => {
  it('reports unconfigured without leaking anything', () => {
    expect(getAiStatus({})).toMatchObject({ configured: false, provider: null, model: null })
  })

  it('treats empty rate variables as unset and falls back to the older names', () => {
    expect(getAiStatus({ DEEPSEEK_API_KEY: 'k', AI_INPUT_COST_PER_MTOK: '', ANTHROPIC_INPUT_COST_PER_MTOK: '1', AI_OUTPUT_COST_PER_MTOK: '', ANTHROPIC_OUTPUT_COST_PER_MTOK: '2' }).costRatesConfigured).toBe(true)
  })

  it('reports provider, model, and whether cost rates make the budget effective', () => {
    const status = getAiStatus({ DEEPSEEK_API_KEY: 'sk-secret', AI_INPUT_COST_PER_MTOK: '0.3', AI_OUTPUT_COST_PER_MTOK: '1.2' })
    expect(status).toMatchObject({ configured: true, provider: 'deepseek', model: 'deepseek-flash', costRatesConfigured: true })
    expect(JSON.stringify(status)).not.toContain('sk-secret')
    expect(getAiStatus({ DEEPSEEK_API_KEY: 'k' }).costRatesConfigured).toBe(false)
  })
})

describe('describeAiFailure', () => {
  it('maps the usual provider failures to Japanese guidance', () => {
    expect(describeAiFailure(new Error('DeepSeek API error (401): Authentication Fails'))).toContain('APIキー')
    expect(describeAiFailure(new Error('DeepSeek API error (402): Insufficient Balance'))).toContain('残高')
    expect(describeAiFailure(new Error('DeepSeek API error (429): rate limit'))).toContain('上限')
    expect(describeAiFailure(new Error('The operation was aborted due to timeout'))).toContain('時間内')
    expect(describeAiFailure(new Error('boom'))).toContain('接続できません')
    expect(describeAiFailure(new Error('DeepSeek API error (422): bad param'))).toContain('DEEPSEEK_MODEL')
    expect(describeAiFailure(new Error('DeepSeek API error (503): busy'))).toContain('一時的')
  })

  it('recognises a real AbortSignal timeout (DOMException TimeoutError) and an unusable answer', async () => {
    const timeout = await new Promise<unknown>((resolve) => {
      const signal = AbortSignal.timeout(1)
      signal.addEventListener('abort', () => resolve(signal.reason))
    })
    expect(describeAiFailure(timeout)).toContain('時間内')
    expect(describeAiFailure(new LlmOutputError('empty', { model: 'm', inputTokens: 1, outputTokens: 0 }))).toContain('使える形式')
  })
})
