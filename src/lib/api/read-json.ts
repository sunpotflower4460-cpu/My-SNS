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
