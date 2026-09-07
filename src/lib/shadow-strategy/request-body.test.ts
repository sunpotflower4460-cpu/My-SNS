import { describe, expect, it } from 'vitest'
import { SHADOW_STRATEGY_IMPORT_MAX_BYTES } from './constants'
import { readJsonBodyWithLimit } from './request-body'

describe('shadow strategy request body limits', () => {
  it('rejects an oversized Content-Length before parsing JSON', async () => {
    const request = new Request('http://localhost/api/internal/shadow-strategy', {
      method: 'POST',
      headers: { 'content-length': String(SHADOW_STRATEGY_IMPORT_MAX_BYTES + 1), 'content-type': 'application/json' },
      body: '{}',
    })
    const result = await readJsonBodyWithLimit(request)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(413)
  })

  it('rejects a body whose UTF-8 byte length exceeds the limit', async () => {
    const body = 'a'.repeat(SHADOW_STRATEGY_IMPORT_MAX_BYTES + 1)
    const request = new Request('http://localhost/api/internal/shadow-strategy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    const result = await readJsonBodyWithLimit(request)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(413)
  })

  it('parses JSON at or under the limit', async () => {
    const request = new Request('http://localhost/api/internal/shadow-strategy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'x' }),
    })
    const result = await readJsonBodyWithLimit(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ workspaceId: 'x' })
  })

  it('rejects invalid JSON', async () => {
    const request = new Request('http://localhost/api/internal/shadow-strategy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    const result = await readJsonBodyWithLimit(request)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
  })
})
