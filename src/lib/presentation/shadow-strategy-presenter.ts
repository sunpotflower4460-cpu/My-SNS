import type { SocialAccount, WorkspaceRole } from '@/lib/domain/types'
import { hasPermission } from '@/lib/permissions'
import type { ShadowGrowthStrategy, ShadowStrategyDimension, ShadowStrategyPattern } from '@/lib/shadow-strategy/types'

export const SHADOW_WARNING =
  'この戦略は現在、分析表示専用です。AI投稿生成・予約・公開には使用されていません。'

export const DIMENSION_LABELS_JA: Record<ShadowStrategyDimension, string> = {
  topic: 'トピック',
  angle: '切り口',
  hook: 'フック',
  emotion: '感情',
  format: '形式',
  cta: 'CTA',
  mediaDecision: 'メディア',
  postingHour: '投稿時間',
}

export function canViewShadowStrategy(role: WorkspaceRole | undefined): boolean {
  return Boolean(role && hasPermission(role, 'view_shadow_strategy'))
}

export function canManageShadowStrategy(role: WorkspaceRole | undefined): boolean {
  return Boolean(role && hasPermission(role, 'manage_shadow_strategy'))
}

export function shadowStatusCopy(status: ShadowGrowthStrategy['status']): string {
  return status === 'insufficient-evidence'
    ? 'まだ判断に十分な実績データがありません'
    : '最近の反応から見えた傾向'
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

export function formatLift(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return rounded > 0 ? `+${rounded}` : String(rounded)
}

export function selectShadowSocialAccounts(accounts: SocialAccount[]): SocialAccount[] {
  return [...accounts].sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform)
    return left.handle.localeCompare(right.handle) || left.id.localeCompare(right.id)
  })
}

export function defaultSelectedSocialAccountId(accounts: SocialAccount[]): string | null {
  return selectShadowSocialAccounts(accounts)[0]?.id ?? null
}

export function accountLabel(account: SocialAccount): string {
  return `${account.platform} / ${account.handle}`
}

export interface ShadowStrategyViewModel {
  empty: boolean
  statusCopy: string | null
  warning: string
  preferredTitle: string
  avoidTitle: string
  preferred: ShadowStrategyPattern[]
  avoid: ShadowStrategyPattern[]
}

export function presentShadowStrategy(strategy: ShadowGrowthStrategy | null): ShadowStrategyViewModel {
  return {
    empty: strategy === null,
    statusCopy: strategy ? shadowStatusCopy(strategy.status) : null,
    warning: SHADOW_WARNING,
    preferredTitle: '最近伸びやすかった傾向',
    avoidTitle: '最近弱かった傾向',
    preferred: strategy?.preferred ?? [],
    avoid: strategy?.avoid ?? [],
  }
}

export function clientImportPayloadError(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return 'JSONを貼り付けてください。'
  try {
    JSON.parse(trimmed)
    return null
  } catch {
    return 'JSONの形式が正しくありません。'
  }
}
