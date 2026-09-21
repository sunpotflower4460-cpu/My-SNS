import { describe, expect, it } from 'vitest'
import { readJsonBody } from './read-json'

describe('readJsonBody', () => {
  it('parses a JSON object body', async () => {
    expect(await readJsonBody(new Response('{"error":"x"}'))).toEqual({ error: 'x' })
  })

  it('returns {} for an HTML gateway error, an empty body, or a non-object', async () => {
    expect(await readJsonBody(new Response('<html>504</html>', { status: 504 }))).toEqual({})
    expect(await readJsonBody(new Response(''))).toEqual({})
    expect(await readJsonBody(new Response('null'))).toEqual({})
    expect(await readJsonBody(new Response('"text"'))).toEqual({})
  })
})
