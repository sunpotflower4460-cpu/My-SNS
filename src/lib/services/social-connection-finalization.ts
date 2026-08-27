export async function finalizeSocialConnectionWithCleanup<T>(params: {
  finalize: () => Promise<T>
  /**
   * Called only when finalize() throws. A database transaction can have
   * committed successfully while its HTTP response is lost; in that case
   * deleting credentials would break a connection that is already live.
   * Return the durable finalized value when that state can be confirmed,
   * otherwise null to confirm that cleanup is safe.
   */
  verifyFinalized?: () => Promise<T | null>
  cleanup: () => Promise<void>
  onVerificationError?: (cause: unknown) => void
  onCleanupError?: (cause: unknown) => void
}): Promise<T> {
  try {
    return await params.finalize()
  } catch (cause) {
    if (params.verifyFinalized) {
      try {
        const verified = await params.verifyFinalized()
        if (verified !== null) return verified
      } catch (verificationCause) {
        // State is unknown. Preserve credentials rather than risk deleting the
        // token of a connection that may already have committed. The caller's
        // state-aware pending-row cleanup can retry later without touching a
        // connected row.
        params.onVerificationError?.(verificationCause)
        throw cause
      }
    }

    await params.cleanup().catch((cleanupCause) => {
      params.onCleanupError?.(cleanupCause)
    })
    throw cause
  }
}
