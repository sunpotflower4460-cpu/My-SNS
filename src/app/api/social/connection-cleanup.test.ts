import { describe, expect, it, vi } from 'vitest'

async function finalizeWithCredentialCleanup(
  finalize: () => Promise<void>,
  cleanup: () => Promise<void>,
): Promise<void> {
  try {
    await finalize()
  } catch (cause) {
    await cleanup().catch(() => undefined)
    throw cause
  }
}

describe('social connection finalization cleanup boundary', () => {
  it('does not clean credentials after a successful finalization', async () => {
    const finalize = vi.fn(async () => undefined)
    const cleanup = vi.fn(async () => undefined)

    await finalizeWithCredentialCleanup(finalize, cleanup)

    expect(finalize).toHaveBeenCalledOnce()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('cleans credentials and preserves the original finalization error', async () => {
    const original = new Error('finalize failed')
    const finalize = vi.fn(async () => { throw original })
    const cleanup = vi.fn(async () => undefined)

    await expect(finalizeWithCredentialCleanup(finalize, cleanup)).rejects.toBe(original)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('preserves the original error even when cleanup also fails', async () => {
    const original = new Error('finalize failed')
    const finalize = vi.fn(async () => { throw original })
    const cleanup = vi.fn(async () => { throw new Error('cleanup failed') })

    await expect(finalizeWithCredentialCleanup(finalize, cleanup)).rejects.toBe(original)
  })
})
