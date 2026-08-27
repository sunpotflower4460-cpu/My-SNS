import { describe, expect, it, vi } from 'vitest'
import { finalizeSocialConnectionWithCleanup } from './social-connection-finalization'

describe('finalizeSocialConnectionWithCleanup', () => {
  it('does not clean credentials after a successful finalization', async () => {
    const finalized = { id: 'account-1', connected: true }
    const finalize = vi.fn(async () => finalized)
    const cleanup = vi.fn(async () => undefined)

    await expect(finalizeSocialConnectionWithCleanup({ finalize, cleanup })).resolves.toBe(finalized)

    expect(finalize).toHaveBeenCalledOnce()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('reconciles a committed finalization whose response was lost without deleting credentials', async () => {
    const original = new Error('RPC response lost')
    const finalized = { id: 'account-1', connected: true }
    const finalize = vi.fn(async () => { throw original })
    const verifyFinalized = vi.fn(async () => finalized)
    const cleanup = vi.fn(async () => undefined)

    await expect(
      finalizeSocialConnectionWithCleanup({ finalize, verifyFinalized, cleanup }),
    ).resolves.toBe(finalized)

    expect(verifyFinalized).toHaveBeenCalledOnce()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('cleans credentials when finalization is confirmed not to have committed', async () => {
    const original = new Error('finalize failed')
    const finalize = vi.fn(async () => { throw original })
    const verifyFinalized = vi.fn(async () => null)
    const cleanup = vi.fn(async () => undefined)

    await expect(
      finalizeSocialConnectionWithCleanup({ finalize, verifyFinalized, cleanup }),
    ).rejects.toBe(original)

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('does not destructively clean credentials when verification itself fails', async () => {
    const original = new Error('finalize response lost')
    const verificationFailure = new Error('verification unavailable')
    const finalize = vi.fn(async () => { throw original })
    const verifyFinalized = vi.fn(async () => { throw verificationFailure })
    const cleanup = vi.fn(async () => undefined)
    const onVerificationError = vi.fn()

    await expect(
      finalizeSocialConnectionWithCleanup({ finalize, verifyFinalized, cleanup, onVerificationError }),
    ).rejects.toBe(original)

    expect(onVerificationError).toHaveBeenCalledWith(verificationFailure)
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('preserves the original error and reports cleanup failure separately', async () => {
    const original = new Error('finalize failed')
    const cleanupFailure = new Error('cleanup failed')
    const finalize = vi.fn(async () => { throw original })
    const verifyFinalized = vi.fn(async () => null)
    const cleanup = vi.fn(async () => { throw cleanupFailure })
    const onCleanupError = vi.fn()

    await expect(
      finalizeSocialConnectionWithCleanup({ finalize, verifyFinalized, cleanup, onCleanupError }),
    ).rejects.toBe(original)
    expect(onCleanupError).toHaveBeenCalledWith(cleanupFailure)
  })
})
