import { describe, expect, it } from 'vitest'
import { museDestinationPath, museLoginReturn, museOpenPath, musePublicOrigin, parseMuseDestination } from './links'

const workspaceId = '10000000-0000-0000-0000-000000000001'
const seedId = '20000000-0000-0000-0000-000000000002'

describe('Muse review links', () => {
  it('keeps the public request host when the runtime rewrites its URL to localhost', () => {
    expect(musePublicOrigin(new Request('https://localhost/api/muse/v1/status', {
      headers: { Host: 'my-sns.example' },
    }))).toBe('https://my-sns.example')
    expect(musePublicOrigin(new Request('https://my-sns.example/api/muse/v1/status', {
      headers: { Host: 'wrong.example@other.example' },
    }))).toBe('https://my-sns.example')
  })

  it('preserves the workspace and Seed through login without forwarding arbitrary query data', () => {
    const path = museOpenPath({ workspaceId, view: 'seed', seedId })
    const returned = museLoginReturn(`${path}&next=https://other.example`)
    expect(returned).toBe(path)
    const destination = parseMuseDestination(new URL(`https://my-sns.example${returned}`).searchParams)
    expect(destination && museDestinationPath(destination)).toBe(`/app/seeds/${seedId}`)
  })

  it.each([
    'https://other.example/app/muse/open',
    '//other.example/app/muse/open',
    `/app/muse/open?workspace=${workspaceId}&view=constructor`,
    `/app/muse/open?workspace=${workspaceId}&view=seed&seed=..%2F..%2Fsettings`,
    '/app/muse/open?workspace=unknown&view=home',
  ])('rejects an invalid return destination: %s', (path) => {
    expect(museLoginReturn(path)).toBeNull()
  })
})
