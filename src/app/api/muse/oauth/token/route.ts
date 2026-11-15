import { createHash } from 'node:crypto'
import { readTextBodyWithLimit } from '@/lib/api/read-json'
import { createMuseKey, MUSE_KEY_DAYS, museJson, sha256 } from '@/lib/muse/connector'
import { musePublicOrigin } from '@/lib/muse/links'
import { museScope, parseMuseTokenRequest } from '@/lib/muse/oauth-params'
import { createServiceClient } from '@/lib/supabase/service'

function failure(error: string, status = 400) {
  return museJson({ error }, status, { Pragma: 'no-cache' })
}

export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    return failure('invalid_request', 415)
  }

  try {
    const body = await readTextBodyWithLimit(request, 8192)
    if (!body.ok) return failure('invalid_request', body.status)
    const authorization = parseMuseTokenRequest(new URLSearchParams(body.text), musePublicOrigin(request))
    if (!authorization) return failure('invalid_request')

    const { key, hash, expiresAt } = createMuseKey()
    const challenge = createHash('sha256').update(authorization.verifier).digest('base64url')
    const { data, error } = await createServiceClient().rpc('exchange_muse_oauth_code', {
      p_code_hash: sha256(authorization.code),
      p_code_challenge: challenge,
      p_redirect_uri: authorization.redirectUri,
      p_token_hash: hash,
      p_expires_at: expiresAt,
    })
    if (error) return failure('server_error', 503)
    if (data === null) return failure('invalid_grant')
    if (typeof data?.canCapture !== 'boolean') return failure('server_error', 503)

    return museJson({
      access_token: key,
      token_type: 'Bearer',
      expires_in: MUSE_KEY_DAYS * 86_400,
      scope: museScope(data.canCapture),
    }, 200, { Pragma: 'no-cache' })
  } catch {
    return failure('server_error', 503)
  }
}
