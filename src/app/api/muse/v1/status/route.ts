import { invalidMuseKey, museJson, museKeyHash, museUnavailable } from '@/lib/muse/connector'
import { isMuseUuid, museOpenPath, musePublicOrigin } from '@/lib/muse/links'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: Request) {
  const hash = museKeyHash(request)
  if (!hash) return invalidMuseKey()

  try {
    const { data, error } = await createServiceClient().rpc('get_muse_connector_status', { p_token_hash: hash })
    if (error) return museUnavailable()
    if (data === null) return invalidMuseKey()
    const { workspaceId, canCapture, draftsToReview, failedPosts, duePosts, inboxNeedsAction } = data
    if (!isMuseUuid(workspaceId) || typeof canCapture !== 'boolean'
      || ![draftsToReview, failedPosts, duePosts, inboxNeedsAction].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      return museUnavailable()
    }
    const origin = musePublicOrigin(request)
    const viewUrl = (view: 'home' | 'drafts' | 'queue' | 'inbox') =>
      new URL(museOpenPath({ workspaceId, view }), origin).href

    return museJson({
      canCapture,
      counts: { draftsToReview, failedPosts, duePosts, inboxNeedsAction },
      urls: {
        home: viewUrl('home'),
        drafts: viewUrl('drafts'),
        queue: viewUrl('queue'),
        inbox: viewUrl('inbox'),
      },
    })
  } catch {
    return museUnavailable()
  }
}
