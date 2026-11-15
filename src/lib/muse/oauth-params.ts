export const MUSE_CLIENT_ID = 'my-sns-muse'
export const MUSE_MCP_PATH = '/api/muse/mcp'
export const MUSE_AUTHORIZE_PATH = '/muse/connect'
export const MUSE_AUTHORIZE_APPROVAL_PATH = '/api/muse/oauth/approve'
export const MUSE_TOKEN_PATH = '/api/muse/oauth/token'
export const MUSE_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server'
export const MUSE_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource'
export const MUSE_READ_SCOPE = 'muse:read'
export const MUSE_CAPTURE_SCOPE = 'muse:capture'
export const MUSE_SCOPES = [MUSE_READ_SCOPE, MUSE_CAPTURE_SCOPE]

const CALLBACKS = new Set([
  'https://muse.ai/api/hatch/oauth/callback',
  'https://agent.meta.ai/api/hatch/oauth/callback',
])
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/
const AUTH_PARAMS = ['client_id', 'response_type', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
const TOKEN_PARAMS = ['client_id', 'grant_type', 'redirect_uri', 'code', 'code_verifier', 'resource']

export type MuseAuthorization = {
  redirectUri: string
  challenge: string
  state: string | null
  canCapture: boolean
  resource: string | null
}

function isResource(value: string | null, origin?: string): boolean {
  if (value === null) return true // Muse clients may omit this parameter.
  try {
    const url = new URL(value)
    return value === url.origin + MUSE_MCP_PATH && (!origin || url.origin === origin)
  } catch {
    return false
  }
}

export function isMuseCallback(value: unknown): value is string {
  return typeof value === 'string' && CALLBACKS.has(value)
}

export function parseMuseAuthorization(params: URLSearchParams, origin?: string): MuseAuthorization | null {
  if (AUTH_PARAMS.some((key) => params.getAll(key).length > 1)) return null
  if (params.get('client_id') !== MUSE_CLIENT_ID || params.get('response_type') !== 'code') return null
  const redirectUri = params.get('redirect_uri')
  const challenge = params.get('code_challenge')
  const state = params.get('state')
  const resource = params.get('resource')
  if (!isMuseCallback(redirectUri) || !challenge || !S256_CHALLENGE.test(challenge)
    || params.get('code_challenge_method') !== 'S256' || !isResource(resource, origin)) return null
  if (state !== null && (!state || state.length > 1536 || /[^\x20-\x7e]/.test(state))) return null

  const scopes = (params.get('scope') ?? MUSE_READ_SCOPE).split(' ').filter(Boolean)
  if (!scopes.includes(MUSE_READ_SCOPE) || scopes.some((scope) => !MUSE_SCOPES.includes(scope))) return null
  return { redirectUri, challenge, state, canCapture: scopes.includes(MUSE_CAPTURE_SCOPE), resource }
}

export function museScope(canCapture: boolean): string {
  return canCapture ? MUSE_SCOPES.join(' ') : MUSE_READ_SCOPE
}

export function museAuthorizationPath(authorization: MuseAuthorization): string {
  const query = new URLSearchParams({
    client_id: MUSE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: authorization.redirectUri,
    code_challenge: authorization.challenge,
    code_challenge_method: 'S256',
    scope: museScope(authorization.canCapture),
  })
  if (authorization.state !== null) query.set('state', authorization.state)
  if (authorization.resource !== null) query.set('resource', authorization.resource)
  return `${MUSE_AUTHORIZE_PATH}?${query}`
}

export function museAuthorizationReturn(value: string | null): string | null {
  const prefix = `${MUSE_AUTHORIZE_PATH}?`
  if (!value?.startsWith(prefix)) return null
  const request = parseMuseAuthorization(new URLSearchParams(value.slice(prefix.length)))
  return request ? museAuthorizationPath(request) : null
}

export function museCallback(authorization: MuseAuthorization, result: { code: string } | { error: 'access_denied' }) {
  const url = new URL(authorization.redirectUri)
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value)
  if (authorization.state !== null) url.searchParams.set('state', authorization.state)
  return url.href
}

export function parseMuseTokenRequest(params: URLSearchParams, origin: string) {
  if (TOKEN_PARAMS.some((key) => params.getAll(key).length > 1)
    || params.get('client_id') !== MUSE_CLIENT_ID
    || params.get('grant_type') !== 'authorization_code'
    || !isResource(params.get('resource'), origin)) return null

  const redirectUri = params.get('redirect_uri')
  const code = params.get('code')
  const verifier = params.get('code_verifier')
  if (!isMuseCallback(redirectUri) || !code || !S256_CHALLENGE.test(code)
    || !verifier || !CODE_VERIFIER.test(verifier)) return null
  return { redirectUri, code, verifier }
}
