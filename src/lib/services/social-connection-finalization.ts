export async function finalizeSocialConnectionWithCleanup(params: {
  finalize: () => Promise<void>
  cleanup: () => Promise<void>
  onCleanupError?: (cause: unknown) => void
}): Promise<void> {
  try {
    await params.finalize()
  } catch (cause) {
    await params.cleanup().catch((cleanupCause) => {
      params.onCleanupError?.(cleanupCause)
    })
    throw cause
  }
}
