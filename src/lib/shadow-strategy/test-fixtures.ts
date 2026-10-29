import { SHADOW_STRATEGY_VERSION } from './constants'

export const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'
export const SOCIAL_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'
export const OTHER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333'
export const OTHER_SOCIAL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
export const SNS_AI_ACCOUNT_ID = 'artist-x-fixture'
export const LINK_ID = 'bridge-account-link:fixture_x'

const META = {
  schemaVersion: 1,
  producer: 'sns-growth-bridge',
  producedAt: '2026-09-04T00:00:00.000Z',
  traceId: 'trace_shadow_fixture',
}

export function validLink(over: Record<string, unknown> = {}) {
  return {
    meta: META,
    linkId: LINK_ID,
    platform: 'x',
    mySns: {
      workspaceId: WORKSPACE_ID,
      socialAccountId: SOCIAL_ACCOUNT_ID,
    },
    snsAi: {
      accountId: SNS_AI_ACCOUNT_ID,
    },
    status: 'active',
    confirmation: 'explicit-operator',
    confirmedAt: '2026-09-04T00:00:00.000Z',
    ...over,
  }
}

export function validPattern(over: Record<string, unknown> = {}) {
  return {
    dimension: 'hook',
    value: 'question',
    sampleSize: 4,
    averageScore: 72,
    lift: 8.5,
    confidence: 0.6,
    rationale: 'hook="question" had +8.5 lift versus the account\'s recent overall score across 4 mature samples.',
    evidencePostIds: ['post-1', 'post-2', 'post-3', 'post-4'],
    ...over,
  }
}

export function validActiveStrategy(over: Record<string, unknown> = {}) {
  return {
    meta: META,
    strategyId: 'bridge-linked-strategy:fixture_x:digest_active',
    strategyVersion: SHADOW_STRATEGY_VERSION,
    subject: {
      workspaceId: WORKSPACE_ID,
      accountId: SNS_AI_ACCOUNT_ID,
    },
    platform: 'x',
    generatedAt: '2026-09-04T12:00:00.000Z',
    sourceWindow: {
      from: '2026-08-05T12:00:00.000Z',
      to: '2026-09-04T12:00:00.000Z',
      strategyWindowDays: 30,
      matureCheckpointMinutes: 1440,
    },
    sampleSize: 12,
    overallScore: 64,
    confidence: 0.55,
    exploreRate: 0.2,
    preferred: [validPattern()],
    avoid: [validPattern({ dimension: 'cta', value: 'hard-sell', lift: -6.2, rationale: 'cta="hard-sell" had -6.2 lift versus the account\'s recent overall score across 4 mature samples.' })],
    inputsDigest: 'sha256:fixture-active',
    status: 'active',
    ...over,
  }
}

export function validInsufficientStrategy(over: Record<string, unknown> = {}) {
  return {
    ...validActiveStrategy({
      strategyId: 'bridge-linked-strategy:fixture_x:digest_insufficient',
      sampleSize: 0,
      overallScore: 50,
      confidence: 0,
      preferred: [],
      avoid: [],
      inputsDigest: 'sha256:fixture-insufficient',
      status: 'insufficient-evidence',
      ...over,
    }),
  }
}

export function validImportPayload(over: { link?: Record<string, unknown>; strategy?: Record<string, unknown> } = {}) {
  return {
    link: validLink(over.link),
    strategy: validActiveStrategy(over.strategy),
  }
}
