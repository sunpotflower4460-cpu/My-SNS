import { SHADOW_STRATEGY_IMPORT_MAX_BYTES } from './constants'

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes = SHADOW_STRATEGY_IMPORT_MAX_BYTES,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; message: string }> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const declared = Number(contentLength)
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, status: 413, message: 'リクエスト本文が大きすぎます。' }
    }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    return { ok: false, status: 400, message: 'リクエスト本文が空です。' }
  }

  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return { ok: false, status: 413, message: 'リクエスト本文が大きすぎます。' }
    }
    chunks.push(value)
  }

  const bytes = concatBytes(chunks, total)
  if (bytes.byteLength === 0) {
    return { ok: false, status: 400, message: 'リクエスト本文が空です。' }
  }
  if (bytes.byteLength > maxBytes) {
    return { ok: false, status: 413, message: 'リクエスト本文が大きすぎます。' }
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: 400, message: 'リクエストの形式が正しくありません。' }
  }
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
