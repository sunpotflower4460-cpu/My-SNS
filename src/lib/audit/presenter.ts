import type { AuditLog } from '@/lib/domain/types'

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

export function describeAuditLog(log: AuditLog): string {
  const actor = log.actor?.name ?? 'Someone'

  switch (log.action) {
    case 'content_created':
      return `${actor} created content${typeof log.metadata?.title === 'string' ? ` “${log.metadata.title}”` : ''}.`
    case 'content_updated':
      return `${actor} updated a content entry.`
    case 'seed_created':
      return `${actor} captured a Seed${typeof log.metadata?.title === 'string' ? ` “${log.metadata.title}”` : ''}.`
    case 'seed_updated':
      return `${actor} updated a Seed.`
    case 'brand_profile_updated':
      return `${actor} updated the Brand Profile${typeof log.metadata?.name === 'string' ? ` “${log.metadata.name}”` : ''}.`
    case 'member_invited':
      return `${actor} invited ${typeof log.metadata?.email === 'string' ? log.metadata.email : 'a teammate'}.`
    case 'member_removed':
      return `${actor} removed a teammate from the workspace.`
    case 'role_changed':
      return `${actor} changed a teammate role${typeof log.metadata?.role === 'string' ? ` to ${log.metadata.role}` : ''}.`
    case 'draft_edited':
      return `${actor} updated a channel draft${typeof log.metadata?.channel === 'string' ? ` for ${log.metadata.channel}` : typeof log.metadata?.platform === 'string' ? ` for ${log.metadata.platform}` : ''}.`
    case 'draft_ai_generated':
      return `${actor} generated AI draft proposals${Array.isArray(log.metadata?.channels) ? ` for ${log.metadata.channels.join(', ')}` : ''}.`
    case 'draft_revision_approved':
      return `${actor} approved a draft${typeof log.metadata?.channel === 'string' ? ` for ${log.metadata.channel}` : ''} and recorded a Revision.`
    case 'queue_item_scheduled':
      return log.metadata?.retried
        ? `${actor} moved a queue item back into the schedule.`
        : `${actor} scheduled a draft for publishing${typeof log.metadata?.channel === 'string' ? ` on ${log.metadata.channel}` : ''}.`
    case 'queue_item_cancelled':
      return `${actor} cancelled a queue item.`
    case 'queue_item_published':
      return `A job ${actor} scheduled was published${typeof log.metadata?.channel === 'string' ? ` to ${log.metadata.channel}` : ''}.`
    case 'queue_item_failed':
      return `A job ${actor} scheduled failed to publish${typeof log.metadata?.failureReason === 'string' ? ` (${log.metadata.failureReason})` : ''}.`
    case 'queue_item_manual_completed':
      return `${actor} recorded a manual publish${typeof log.metadata?.channel === 'string' ? ` for ${log.metadata.channel}` : ''}.`
    case 'inbox_item_read':
      return `${actor} updated read state on an inbox item.`
    case 'inbox_item_starred':
      return `${actor} updated a starred inbox item.`
    case 'inbox_item_needs_action':
      return `${actor} updated the needs-action state on an inbox item.`
    case 'inbox_note_added':
      return `${actor} added an internal inbox note.`
    case 'workspace_settings_updated':
      return `${actor} updated workspace settings.`
    case 'social_account_connected':
      return `${actor} connected ${typeof log.metadata?.platform === 'string' ? log.metadata.platform : 'a social account'}${typeof log.metadata?.handle === 'string' ? ` (${log.metadata.handle})` : ''}.`
    case 'social_account_disconnected':
      return `${actor} disconnected ${typeof log.metadata?.platform === 'string' ? log.metadata.platform : 'a social account'}.`
    case 'workspace_data_exported':
      return `${actor} exported a workspace data backup${typeof log.metadata?.seeds === 'number' ? ` (${log.metadata.seeds} Seeds)` : ''}.`
    default:
      return `${actor} made a workspace update.`
  }
}

export function getAuditLogMeta(log: AuditLog): string {
  return formatTimestamp(log.createdAt)
}
