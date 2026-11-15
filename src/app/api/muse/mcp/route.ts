import { readJsonBodyWithLimit } from '@/lib/api/read-json'
import { MUSE_GOAL_MAX, MUSE_REQUEST_MAX_BYTES, MUSE_TEXT_MAX, MUSE_TITLE_MAX, museJson } from '@/lib/muse/connector'
import { musePublicOrigin } from '@/lib/muse/links'
import { MUSE_MCP_PATH, MUSE_RESOURCE_METADATA_PATH } from '@/lib/muse/oauth-params'
import { CORE_PUBLISHING_CHANNELS } from '@/lib/domain/types'
import { POST as captureSeed } from '../v1/seeds/route'
import { GET as readStatus } from '../v1/status/route'

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18']
const STATUS_TOOL = {
  name: 'get_my_sns_status',
  description: 'My-SNS の要対応件数と各画面へのリンクを取得する。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
}
const CAPTURE_TOOL = {
  name: 'save_my_sns_seed',
  description: '文章やリンクを発信素材として保存し、My-SNS の確認リンクを返す。アクションを再試行するときは同じ requestId と内容を使う。',
  inputSchema: {
    type: 'object',
    properties: {
      requestId: { type: 'string', format: 'uuid', description: 'この保存操作のために一度だけ生成する UUID' },
      title: { type: 'string', maxLength: MUSE_TITLE_MAX },
      sourceText: { type: 'string', maxLength: MUSE_TEXT_MAX },
      goal: { type: 'string', maxLength: MUSE_GOAL_MAX },
      targetChannels: { type: 'array', items: { enum: CORE_PUBLISHING_CHANNELS }, uniqueItems: true },
    },
    required: ['requestId', 'title', 'sourceText'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

type ObjectValue = Record<string, unknown>
function record(value: unknown): ObjectValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null
}

function invalidKey(origin: string) {
  const metadata = origin + MUSE_RESOURCE_METADATA_PATH + MUSE_MCP_PATH
  return museJson({ error: 'invalid_token' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${metadata}"` })
}

async function authenticate(request: Request) {
  const origin = musePublicOrigin(request)
  const caller = request.headers.get('origin')
  if (caller && caller !== origin && caller !== 'https://muse.ai' && caller !== 'https://agent.meta.ai') {
    return museJson({ error: 'invalid_origin' }, 403)
  }
  const response = await readStatus(request)
  if (response.status === 401) return invalidKey(origin)
  return response.ok ? await response.json() as ObjectValue : response
}

export async function GET(request: Request) {
  const status = await authenticate(request)
  if (status instanceof Response) return status
  return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const status = await authenticate(request)
  if (status instanceof Response) return status
  const version = request.headers.get('mcp-protocol-version')
  if (version && !PROTOCOL_VERSIONS.includes(version)) {
    return museJson({ error: 'unsupported_protocol_version' }, 400)
  }

  const body = await readJsonBodyWithLimit(request, MUSE_REQUEST_MAX_BYTES)
  const message = body.ok ? record(body.value) : null
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return museJson({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }, body.ok ? 400 : body.status)
  }
  if (message.id === undefined) return new Response(null, { status: 202 })
  if (typeof message.id !== 'number' && typeof message.id !== 'string') {
    return museJson({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request id' } }, 400)
  }

  const envelope = { jsonrpc: '2.0', id: message.id }
  const reply = (result: ObjectValue) => museJson({ ...envelope, result })
  const error = (code: number, description: string) => museJson({ ...envelope, error: { code, message: description } })
  const toolResult = (value: ObjectValue, isError = false) => reply({
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  })
  const params = record(message.params)

  switch (message.method) {
    case 'initialize': {
      const requestedVersion = params?.protocolVersion
      return reply({
        protocolVersion: typeof requestedVersion === 'string' && PROTOCOL_VERSIONS.includes(requestedVersion)
          ? requestedVersion : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'my-sns', version: '1.0.0' },
      })
    }
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: status.canCapture ? [STATUS_TOOL, CAPTURE_TOOL] : [STATUS_TOOL] })
    case 'tools/call': {
      if (params?.name === STATUS_TOOL.name) return toolResult(status)
      if (params?.name !== CAPTURE_TOOL.name || !status.canCapture) return error(-32602, 'Unknown or unavailable tool')
      const response = await captureSeed(new Request(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: request.headers.get('authorization') ?? '',
          Host: request.headers.get('host') ?? new URL(request.url).host,
        },
        body: JSON.stringify(params.arguments ?? {}),
      }))
      if (response.status === 401) return invalidKey(musePublicOrigin(request))
      return toolResult(await response.json() as ObjectValue, !response.ok)
    }
    default:
      return error(-32601, 'Method not found')
  }
}
