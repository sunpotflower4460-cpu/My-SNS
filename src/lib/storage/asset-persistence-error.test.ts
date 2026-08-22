import { describe, expect, it } from 'vitest'
import { AssetPersistenceError, getSeedIdFromAssetPersistenceError } from './asset-persistence-error'

describe('AssetPersistenceError', () => {
  it('exposes the persisted Seed id for recovery', () => {
    const error = new AssetPersistenceError('upload failed', 'seed-123')
    expect(getSeedIdFromAssetPersistenceError(error)).toBe('seed-123')
  })

  it('does not misclassify unrelated errors', () => {
    expect(getSeedIdFromAssetPersistenceError(new Error('nope'))).toBeNull()
    expect(getSeedIdFromAssetPersistenceError(new AssetPersistenceError('no seed'))).toBeNull()
  })
})
