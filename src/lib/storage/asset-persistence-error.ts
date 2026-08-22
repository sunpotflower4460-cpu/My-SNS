export class AssetPersistenceError extends Error {
  readonly seedId?: string

  constructor(message: string, seedId?: string) {
    super(message)
    this.name = 'AssetPersistenceError'
    this.seedId = seedId
  }
}

export function getSeedIdFromAssetPersistenceError(cause: unknown): string | null {
  return cause instanceof AssetPersistenceError && cause.seedId ? cause.seedId : null
}
