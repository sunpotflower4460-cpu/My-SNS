import {
  OFFSET_ISO_DATETIME,
  SHADOW_STRATEGY_DIMENSIONS,
  SHADOW_STRATEGY_PLATFORMS,
  SHADOW_STRATEGY_PRODUCERS,
  SHADOW_STRATEGY_SCHEMA_VERSION,
  SHADOW_STRATEGY_VERSION,
} from './constants'
import type {
  ShadowStrategyDimension,
  ShadowStrategyImportPayload,
  ShadowStrategyParseResult,
  ShadowStrategyPattern,
  ShadowStrategyPlatform,
  ShadowStrategyStatus,
  ValidatedAccountLink,
  ValidatedGrowthStrategy,
} from './types'

function fail(code: string, message: string): ShadowStrategyParseResult<never> {
  return { ok: false, code, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeInt(value: unknown): number | null {
  const n = finiteNumber(value)
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null
}

function positiveInt(value: unknown): number | null {
  const n = nonNegativeInt(value)
  return n !== null && n > 0 ? n : null
}

function score100(value: unknown): number | null {
  const n = finiteNumber(value)
  return n !== null && n >= 0 && n <= 100 ? n : null
}

function unitInterval(value: unknown): number | null {
  const n = finiteNumber(value)
  return n !== null && n >= 0 && n <= 1 ? n : null
}

function offsetIsoDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || !OFFSET_ISO_DATETIME.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? value : null
}

function isPlatform(value: unknown): value is ShadowStrategyPlatform {
  return typeof value === 'string' && (SHADOW_STRATEGY_PLATFORMS as readonly string[]).includes(value)
}

function isDimension(value: unknown): value is ShadowStrategyDimension {
  return typeof value === 'string' && (SHADOW_STRATEGY_DIMENSIONS as readonly string[]).includes(value)
}

function parseMeta(value: unknown, path: string): ShadowStrategyParseResult<{ schemaVersion: 1 }> {
  if (!isRecord(value)) return fail('invalid-meta', `${path}.meta が不正です。`)
  if (value.schemaVersion !== SHADOW_STRATEGY_SCHEMA_VERSION) {
    return fail('unsupported-schema', `未対応の schemaVersion です。受け付けるのは ${SHADOW_STRATEGY_SCHEMA_VERSION} のみです。`)
  }
  if (typeof value.producer !== 'string' || !(SHADOW_STRATEGY_PRODUCERS as readonly string[]).includes(value.producer)) {
    return fail('invalid-meta', `${path}.meta.producer が不正です。`)
  }
  if (!offsetIsoDateTime(value.producedAt)) {
    return fail('invalid-datetime', `${path}.meta.producedAt は offset 付き ISO datetime である必要があります。`)
  }
  if (!nonEmptyString(value.traceId)) {
    return fail('invalid-meta', `${path}.meta.traceId が不正です。`)
  }
  return { ok: true, value: { schemaVersion: SHADOW_STRATEGY_SCHEMA_VERSION } }
}

function parsePattern(value: unknown, path: string): ShadowStrategyParseResult<ShadowStrategyPattern> {
  if (!isRecord(value)) return fail('invalid-pattern', `${path} が不正です。`)
  if (!isDimension(value.dimension)) {
    return fail('unknown-dimension', `${path}.dimension は許可された成長次元ではありません。`)
  }
  const parsedValue = nonEmptyString(value.value)
  const sampleSize = positiveInt(value.sampleSize)
  const averageScore = score100(value.averageScore)
  const lift = finiteNumber(value.lift)
  const confidence = unitInterval(value.confidence)
  const rationale = nonEmptyString(value.rationale)
  if (!parsedValue) return fail('invalid-pattern', `${path}.value が不正です。`)
  if (sampleSize === null) return fail('invalid-pattern', `${path}.sampleSize は 1 以上の整数である必要があります。`)
  if (averageScore === null) return fail('invalid-pattern', `${path}.averageScore は 0〜100 の有限数である必要があります。`)
  if (lift === null) return fail('invalid-lift', `${path}.lift は有限数である必要があります。`)
  if (confidence === null) return fail('invalid-pattern', `${path}.confidence は 0〜1 の有限数である必要があります。`)
  if (!rationale) return fail('invalid-pattern', `${path}.rationale が不正です。`)
  if (!Array.isArray(value.evidencePostIds)) {
    return fail('invalid-pattern', `${path}.evidencePostIds が不正です。`)
  }
  const evidencePostIds: string[] = []
  for (const [index, item] of value.evidencePostIds.entries()) {
    const id = nonEmptyString(item)
    if (!id) return fail('invalid-pattern', `${path}.evidencePostIds[${index}] が不正です。`)
    evidencePostIds.push(id)
  }
  return {
    ok: true,
    value: {
      dimension: value.dimension,
      value: parsedValue,
      sampleSize,
      averageScore,
      lift,
      confidence,
      rationale,
      evidencePostIds,
    },
  }
}

function parsePatterns(value: unknown, path: string): ShadowStrategyParseResult<ShadowStrategyPattern[]> {
  if (!Array.isArray(value)) return fail('invalid-pattern', `${path} は配列である必要があります。`)
  const patterns: ShadowStrategyPattern[] = []
  for (const [index, item] of value.entries()) {
    const parsed = parsePattern(item, `${path}[${index}]`)
    if (!parsed.ok) return parsed
    patterns.push(parsed.value)
  }
  return { ok: true, value: patterns }
}

function parseLink(value: unknown): ShadowStrategyParseResult<ValidatedAccountLink> {
  if (!isRecord(value)) return fail('missing-link', 'link はオブジェクトである必要があります。')
  const meta = parseMeta(value.meta, 'link')
  if (!meta.ok) return meta
  const linkId = nonEmptyString(value.linkId)
  if (!linkId) return fail('invalid-link', 'link.linkId は必須です。')
  if (!isPlatform(value.platform)) return fail('invalid-platform', 'link.platform が不正です。')
  if (!isRecord(value.mySns)) return fail('invalid-link', 'link.mySns が不正です。')
  const workspaceId = nonEmptyString(value.mySns.workspaceId)
  const socialAccountId = nonEmptyString(value.mySns.socialAccountId)
  if (!workspaceId) return fail('invalid-link', 'link.mySns.workspaceId は必須です。')
  if (!socialAccountId) return fail('invalid-link', 'link.mySns.socialAccountId は必須です。')
  if (!isRecord(value.snsAi)) return fail('invalid-link', 'link.snsAi が不正です。')
  const snsAiAccountId = nonEmptyString(value.snsAi.accountId)
  if (!snsAiAccountId) return fail('invalid-link', 'link.snsAi.accountId は必須です。')
  if (value.status !== 'active') {
    return fail('disabled-link', 'active な Explicit Link だけを取り込みます。')
  }
  if (value.confirmation !== 'explicit-operator') {
    return fail('non-explicit-confirmation', 'confirmation は explicit-operator である必要があります。')
  }
  const confirmedAt = offsetIsoDateTime(value.confirmedAt)
  if (!confirmedAt) return fail('invalid-datetime', 'link.confirmedAt は offset 付き ISO datetime である必要があります。')
  return {
    ok: true,
    value: {
      linkId,
      platform: value.platform,
      workspaceId,
      socialAccountId,
      snsAiAccountId,
      confirmedAt,
    },
  }
}

function parseStrategy(value: unknown): ShadowStrategyParseResult<ValidatedGrowthStrategy> {
  if (!isRecord(value)) return fail('missing-strategy', 'strategy はオブジェクトである必要があります。')
  const meta = parseMeta(value.meta, 'strategy')
  if (!meta.ok) return meta
  if (value.strategyVersion !== SHADOW_STRATEGY_VERSION) {
    return fail('unknown-strategy-version', `未対応の strategyVersion です。受け付けるのは ${SHADOW_STRATEGY_VERSION} のみです。`)
  }
  if (value.status === 'invalid-input') {
    return fail('invalid-input', 'invalid-input の Strategy は取り込みません。')
  }
  if (value.status !== 'active' && value.status !== 'insufficient-evidence') {
    return fail('invalid-status', 'strategy.status は active または insufficient-evidence である必要があります。')
  }
  const status = value.status as ShadowStrategyStatus
  const strategyId = nonEmptyString(value.strategyId)
  if (!strategyId) return fail('invalid-strategy', 'strategy.strategyId は必須です。')
  if (!isRecord(value.subject)) return fail('invalid-strategy', 'strategy.subject が不正です。')
  if (value.subject.creatorId !== undefined) {
    return fail('creator-id-present', 'Phase 7B では creatorId が解決できないため、creatorId 付き Strategy は拒否します。')
  }
  const workspaceId = nonEmptyString(value.subject.workspaceId)
  const snsAiAccountId = nonEmptyString(value.subject.accountId)
  if (!workspaceId) return fail('invalid-strategy', 'strategy.subject.workspaceId は必須です。')
  if (!snsAiAccountId) return fail('invalid-strategy', 'strategy.subject.accountId は必須です。')
  if (!isPlatform(value.platform)) return fail('invalid-platform', 'strategy.platform が不正です。')
  const generatedAt = offsetIsoDateTime(value.generatedAt)
  if (!generatedAt) return fail('invalid-datetime', 'strategy.generatedAt は offset 付き ISO datetime である必要があります。')
  if (!isRecord(value.sourceWindow)) return fail('invalid-source-window', 'strategy.sourceWindow が不正です。')
  const from = offsetIsoDateTime(value.sourceWindow.from)
  const to = offsetIsoDateTime(value.sourceWindow.to)
  const strategyWindowDays = positiveInt(value.sourceWindow.strategyWindowDays)
  const matureCheckpointMinutes = positiveInt(value.sourceWindow.matureCheckpointMinutes)
  if (!from || !to) {
    return fail('invalid-source-window', 'strategy.sourceWindow.from / to は offset 付き ISO datetime である必要があります。')
  }
  if (Date.parse(from) > Date.parse(to)) {
    return fail('inverted-source-window', 'strategy.sourceWindow.from は to 以前である必要があります。')
  }
  if (strategyWindowDays === null || matureCheckpointMinutes === null) {
    return fail('invalid-source-window', 'strategyWindowDays と matureCheckpointMinutes は正の整数である必要があります。')
  }
  const sampleSize = nonNegativeInt(value.sampleSize)
  const overallScore = score100(value.overallScore)
  const confidence = unitInterval(value.confidence)
  const exploreRate = unitInterval(value.exploreRate)
  if (sampleSize === null) return fail('invalid-number', 'strategy.sampleSize は 0 以上の整数である必要があります。')
  if (overallScore === null) return fail('invalid-number', 'strategy.overallScore は 0〜100 の有限数である必要があります。')
  if (confidence === null) return fail('invalid-number', 'strategy.confidence は 0〜1 の有限数である必要があります。')
  if (exploreRate === null) return fail('invalid-number', 'strategy.exploreRate は 0〜1 の有限数である必要があります。')
  const preferred = parsePatterns(value.preferred, 'strategy.preferred')
  if (!preferred.ok) return preferred
  const avoid = parsePatterns(value.avoid, 'strategy.avoid')
  if (!avoid.ok) return avoid
  const inputsDigest = nonEmptyString(value.inputsDigest)
  if (!inputsDigest) return fail('invalid-strategy', 'strategy.inputsDigest は必須です。')
  if (status === 'insufficient-evidence') {
    if (sampleSize !== 0 || confidence !== 0 || preferred.value.length > 0 || avoid.value.length > 0) {
      return fail(
        'insufficient-evidence-invariant',
        'insufficient-evidence では sampleSize=0, confidence=0, preferred=[], avoid=[] が必須です。',
      )
    }
  }
  if (status === 'active' && sampleSize < 1) {
    return fail('invalid-status', 'active な Strategy は sampleSize >= 1 が必要です。')
  }
  return {
    ok: true,
    value: {
      strategyId,
      strategyVersion: SHADOW_STRATEGY_VERSION,
      workspaceId,
      snsAiAccountId,
      platform: value.platform,
      generatedAt,
      sourceWindow: {
        from,
        to,
        strategyWindowDays,
        matureCheckpointMinutes,
      },
      sampleSize,
      overallScore,
      confidence,
      exploreRate,
      preferred: preferred.value,
      avoid: avoid.value,
      inputsDigest,
      status,
    },
  }
}

export function parseShadowStrategyImportPayload(input: unknown): ShadowStrategyParseResult<ShadowStrategyImportPayload> {
  if (!isRecord(input)) return fail('invalid-payload', 'payload は { link, strategy } である必要があります。')
  if (!('link' in input) || input.link === undefined) return fail('missing-link', 'Strategy 単体では取り込めません。Explicit Link が必要です。')
  if (!('strategy' in input) || input.strategy === undefined) return fail('missing-strategy', 'strategy は必須です。')
  const link = parseLink(input.link)
  if (!link.ok) return link
  const strategy = parseStrategy(input.strategy)
  if (!strategy.ok) return strategy
  if (strategy.value.workspaceId !== link.value.workspaceId) {
    return fail('workspace-mismatch', 'strategy.subject.workspaceId と link.mySns.workspaceId が一致しません。')
  }
  if (strategy.value.snsAiAccountId !== link.value.snsAiAccountId) {
    return fail('sns-ai-account-mismatch', 'strategy.subject.accountId と link.snsAi.accountId が一致しません。')
  }
  if (strategy.value.platform !== link.value.platform) {
    return fail('platform-mismatch', 'strategy.platform と link.platform が一致しません。')
  }
  return { ok: true, value: { link: link.value, strategy: strategy.value } }
}
