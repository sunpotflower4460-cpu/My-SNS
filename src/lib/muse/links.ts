export const MUSE_API_PATH = '/api/muse/v1'
export const MUSE_SPEC_PATH = `${MUSE_API_PATH}/openapi`
export const MUSE_OPEN_PATH = '/app/muse/open'
export const MUSE_SITE = 'https://muse.ai/'
export const MUSE_META_HELP = 'https://www.meta.com/help/superintelligence/1687253048996149/'

const MUSE_PAGES = {
  home: '/app/dashboard',
  drafts: '/app/drafts',
  queue: '/app/queue',
  inbox: '/app/inbox',
  brand: '/app/brand',
  connection: '/app/muse',
} as const

type MuseView = keyof typeof MUSE_PAGES | 'seed'

export type MuseDestination = { workspaceId: string } & (
  | { view: Exclude<MuseView, 'seed'> }
  | { view: 'seed'; seedId: string }
)

export function isMuseUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function parseMuseDestination(params: Pick<URLSearchParams, 'get'>): MuseDestination | null {
  const workspaceId = params.get('workspace')
  const view = params.get('view')
  const seedId = params.get('seed')
  if (!isMuseUuid(workspaceId)) return null
  if (view === 'seed') return isMuseUuid(seedId) ? { workspaceId: workspaceId.toLowerCase(), view, seedId: seedId.toLowerCase() } : null
  if (!view || !Object.prototype.hasOwnProperty.call(MUSE_PAGES, view)) return null
  return { workspaceId: workspaceId.toLowerCase(), view: view as keyof typeof MUSE_PAGES }
}

export function museOpenPath(target: MuseDestination): string {
  const params = new URLSearchParams({ workspace: target.workspaceId, view: target.view })
  if (target.view === 'seed') params.set('seed', target.seedId)
  return `${MUSE_OPEN_PATH}?${params}`
}

export function museDestinationPath(target: MuseDestination): string {
  return target.view === 'seed' ? `/app/seeds/${target.seedId}` : MUSE_PAGES[target.view]
}

/** Next self-hosting can reconstruct request.url with localhost even on the public host. */
export function musePublicOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get('host')
  if (host && /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]{1,5})?$/i.test(host)) {
    try { return new URL(`${url.protocol}//${host}`).origin } catch { /* Fall back to URL's parsed host. */ }
  }
  return url.origin
}

/** Only keep My-SNS-generated Muse links through sign-in; never trust a return URL. */
export function museLoginReturn(value: string | null): string | null {
  const prefix = `${MUSE_OPEN_PATH}?`
  if (!value?.startsWith(prefix)) return null
  const destination = parseMuseDestination(new URLSearchParams(value.slice(prefix.length)))
  return destination ? museOpenPath(destination) : null
}
