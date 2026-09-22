export const SHADOW_STRATEGY_SCHEMA_VERSION = 1 as const
export const SHADOW_STRATEGY_VERSION = 'sns-ai-learn-parity-v1' as const
export const SHADOW_STRATEGY_IMPORT_MAX_BYTES = 256 * 1024
export const SHADOW_STRATEGY_HISTORY_LIMIT = 10

export const SHADOW_STRATEGY_PLATFORMS = [
  'x',
  'instagram',
  'youtube',
  'tiktok',
  'threads',
  'facebook',
  'note',
  'website',
] as const

export const SHADOW_STRATEGY_DIMENSIONS = [
  'topic',
  'angle',
  'hook',
  'emotion',
  'format',
  'cta',
  'mediaDecision',
  'postingHour',
] as const

export const SHADOW_STRATEGY_PRODUCERS = ['my-sns', 'sns-ai', 'sns-growth-bridge'] as const

export const OFFSET_ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
