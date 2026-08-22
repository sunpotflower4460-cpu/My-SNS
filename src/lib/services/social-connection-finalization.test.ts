import { describe, expect, it, vi } from 'vitest'
import { finalizeSocialConnectionWithCleanup } from './social-connection-finalization'

describe('finalizeSocialConnectionWithCleanup', () => {
  it('does not clean credentials after a successful finalization', async () => {
    const finalize = vi.fn(async () => undefined)
    const cleanup = vi.fn(async () => undefined)

    await finalizeSocialConnectionWithCleanup({ finalize, cleanup })

    expect(finalize).toHaveBeenCalledOnce()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('cleans credentials and preserves the original finalization error', async () => {
    const original = new Error('finalize failed')
    const finalize = vi.fn(async () => { throw original })
    const cleanup = vi.fn(async () => undefined)

    await expect(finalizeSocialConnectionWithCleanup({ finalize, cleanup })).rejects.toBe(original)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('preserves the original error and reports cleanup failure separately', async () => {
    const original = new Error('finalize failed')
    const cleanupFailure = new Error('cleanup failed')
    const finalize = vi.fn(async () => { throw original })
    const cleanup = vi.fn(async () => { throw cleanupFailure })
    const onCleanupError = vi.fn()

    await expect(finalizeSocialConnectionWithCleanup({ finalize, cleanup, onCleanupError })).rejects.toBe(original)
    expect(onCleanupError).toHaveBeenCalledWith(cleanupFailure)
  })
})
