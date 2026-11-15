import { musePublicOrigin } from '@/lib/muse/links'
import { MUSE_MCP_PATH, MUSE_RESOURCE_METADATA_PATH, MUSE_SCOPES } from '@/lib/muse/oauth-params'

export function GET(request: Request) {
  const path = new URL(request.url).pathname
  if (path !== MUSE_RESOURCE_METADATA_PATH && path !== MUSE_RESOURCE_METADATA_PATH + MUSE_MCP_PATH) {
    return new Response(null, { status: 404 })
  }

  const origin = musePublicOrigin(request)
  return Response.json({
    resource: origin + MUSE_MCP_PATH,
    resource_name: 'My-SNS',
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: MUSE_SCOPES,
  })
}
