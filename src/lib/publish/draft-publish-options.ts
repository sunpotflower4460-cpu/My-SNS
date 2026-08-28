export type YoutubePrivacyStatus = 'public' | 'private' | 'unlisted'

export interface DraftPublishOptions {
  socialAccountId?: string
  thumbnailAssetId?: string
  coverAssetId?: string
  eyecatchAssetId?: string
  isShort?: boolean
  privacyStatus?: YoutubePrivacyStatus
  coverTimestampMs?: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalUuid(value: unknown): string | undefined {
  const text = optionalString(value)
  return text && UUID_PATTERN.test(text) ? text : undefined
}

export function parseDraftPublishOptions(metadata: Record<string, unknown> | null | undefined): DraftPublishOptions {
  const source = metadata ?? {}
  const privacy = optionalString(source.privacyStatus)
  const coverTimestampMs = typeof source.coverTimestampMs === 'number' && Number.isFinite(source.coverTimestampMs)
    ? Math.max(0, Math.round(source.coverTimestampMs))
    : undefined

  return {
    socialAccountId: optionalUuid(source.socialAccountId),
    thumbnailAssetId: optionalUuid(source.thumbnailAssetId),
    coverAssetId: optionalUuid(source.coverAssetId),
    eyecatchAssetId: optionalUuid(source.eyecatchAssetId),
    isShort: source.isShort === true ? true : undefined,
    privacyStatus: privacy === 'public' || privacy === 'private' || privacy === 'unlisted' ? privacy : undefined,
    coverTimestampMs,
  }
}

export function mergeDraftPublishOptions(
  metadata: Record<string, unknown> | null | undefined,
  patch: DraftPublishOptions,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) }

  const assign = (key: keyof DraftPublishOptions, value: string | boolean | number | undefined) => {
    if (value === undefined || value === '') delete next[key]
    else next[key] = value
  }

  assign('socialAccountId', patch.socialAccountId)
  assign('thumbnailAssetId', patch.thumbnailAssetId)
  assign('coverAssetId', patch.coverAssetId)
  assign('eyecatchAssetId', patch.eyecatchAssetId)
  assign('isShort', patch.isShort)
  assign('privacyStatus', patch.privacyStatus)
  assign('coverTimestampMs', patch.coverTimestampMs)
  return next
}
