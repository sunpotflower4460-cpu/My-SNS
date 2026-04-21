import type { AuditAction, AuditLog } from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'
import { createId, nowIso, sortByNewest, withAuditRelations } from './helpers'

export function listWorkspaceAuditLogs(
  state: MockAppDataState,
  workspaceId: string,
  limit?: number,
): AuditLog[] {
  const logs = state.auditLogs
    .filter((log) => log.workspaceId === workspaceId)
    .map((log) => withAuditRelations(log, state.users))

  const sorted = sortByNewest(logs)
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
}

export function listTargetAuditLogs(
  state: MockAppDataState,
  workspaceId: string,
  targetId: string,
  limit?: number,
): AuditLog[] {
  const logs = state.auditLogs
    .filter((log) => log.workspaceId === workspaceId && log.targetId === targetId)
    .map((log) => withAuditRelations(log, state.users))

  const sorted = sortByNewest(logs)
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
}

export function appendAuditLog(
  state: MockAppDataState,
  params: {
    workspaceId: string
    actorId: string
    action: AuditAction
    targetType?: string
    targetId?: string
    metadata?: Record<string, unknown>
  },
): { state: MockAppDataState; log: AuditLog } {
  const log: AuditLog = {
    id: createId('al'),
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata,
    createdAt: nowIso(),
  }

  return {
    state: {
      ...state,
      auditLogs: [log, ...state.auditLogs],
    },
    log: withAuditRelations(log, state.users),
  }
}
