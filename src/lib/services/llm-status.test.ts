import { describe, expect, it } from 'vitest'
import { describeAiFailure, getAiStatus } from './llm-status'

describe('getAiStatus', () => {
  it('reports unconfigured without leaking anything', () => {
    expect(getAiStatus({})).toMatchObject({ configured: false, provider: null, model: null })
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
  })
})
