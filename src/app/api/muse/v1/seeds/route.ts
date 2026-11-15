import { readJsonBodyWithLimit } from '@/lib/api/read-json'
import {
  invalidMuseKey, MUSE_REQUEST_MAX_BYTES, museJson, museKeyHash, museUnavailable, parseMuseCapture, sha256,
} from '@/lib/muse/connector'
import { isMuseUuid, museOpenPath, musePublicOrigin } from '@/lib/muse/links'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: Request) {
  const hash = museKeyHash(request)
  if (!hash) return invalidMuseKey()
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return museJson({ code: 'UNSUPPORTED_CONTENT_TYPE', error: 'application/json で送信してください。' }, 415)
  }

  try {
    const body = await readJsonBodyWithLimit(request, MUSE_REQUEST_MAX_BYTES)
    if (!body.ok) return museJson({ code: body.status === 413 ? 'TOO_LARGE' : 'INVALID_INPUT', error: body.message }, body.status)
    const seed = parseMuseCapture(body.value)
    if (!seed) {
      return museJson({ code: 'INVALID_INPUT', error: 'requestId、タイトル、素材の本文と、指定した公開先を確認してください。' }, 400)
    }

    const { requestId, ...content } = seed
    const { data, error } = await createServiceClient().rpc('capture_muse_seed', {
      p_token_hash: hash,
      p_request_id: requestId,
      p_payload_hash: sha256(JSON.stringify(content)),
      p_title: content.title,
      p_source_text: content.sourceText,
      p_goal: content.goal,
      p_channels: content.targetChannels,
    })
    if (error || !data) return museUnavailable()

    switch (data.code) {
      case 'INVALID_KEY': return invalidMuseKey()
      case 'READ_ONLY':
        return museJson({ code: data.code, error: 'このキーでは状況の確認だけができます。発信素材の保存は許可されていません。' }, 403)
      case 'REQUEST_CONFLICT':
        return museJson({ code: data.code, error: 'このリクエストIDは異なる素材に使用済みです。' }, 409)
      case 'SEED_REMOVED':
        return museJson({ code: data.code, error: 'この発信素材は My-SNS で削除されています。' }, 409)
      case 'CAPTURE_LIMIT':
        return museJson({ code: data.code, error: '1時間あたり30件の保存上限に達しました。時間をおいてお試しください。' }, 429)
      case 'BRAND_REQUIRED': {
        if (!isMuseUuid(data.workspaceId)) return museUnavailable()
        const url = new URL(museOpenPath({ workspaceId: data.workspaceId, view: 'brand' }), musePublicOrigin(request)).href
        return museJson({ code: data.code, error: 'My-SNS で最初に発信スタイルを設定してください。', url }, 422)
      }
      case undefined: break
      default: return museUnavailable()
    }

    const { workspaceId, seedId, created } = data
    if (!isMuseUuid(workspaceId) || !isMuseUuid(seedId) || typeof created !== 'boolean') return museUnavailable()
    const url = new URL(museOpenPath({ workspaceId, view: 'seed', seedId }), musePublicOrigin(request)).href
    return museJson({ seedId, created, url }, created ? 201 : 200)
  } catch {
    return museUnavailable()
  }
}
