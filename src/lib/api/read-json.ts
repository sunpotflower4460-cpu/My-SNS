/**
 * Body of a fetch Response as JSON, or an empty object when it is not JSON.
 *
 * A platform-level failure (a timeout, a gateway error) answers with an HTML or
 * empty body. Calling response.json() on it throws "Unexpected token …", which
 * hides the real problem and skips the caller's own error message. Callers
 * check response.ok and fall back to their own Japanese message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonBody(response: Response): Promise<any> {
  try {
    const body = await response.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number,
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
