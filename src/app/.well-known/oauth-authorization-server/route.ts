import { musePublicOrigin } from '@/lib/muse/links'
import { MUSE_AUTHORIZE_PATH, MUSE_SCOPES, MUSE_TOKEN_PATH } from '@/lib/muse/oauth-params'

export function GET(request: Request) {
  const issuer = musePublicOrigin(request)
  return Response.json({
    issuer,
    authorization_endpoint: issuer + MUSE_AUTHORIZE_PATH,
    token_endpoint: issuer + MUSE_TOKEN_PATH,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: MUSE_SCOPES,
  })
}
