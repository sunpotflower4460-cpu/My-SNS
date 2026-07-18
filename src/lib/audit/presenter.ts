import type { AuditLog } from '@/lib/domain/types'

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export function describeAuditLog(log: AuditLog): string {
  const actor = log.actor?.name ?? '誰か'

  switch (log.action) {
    case 'content_created':
      return `${actor}さんがコンテンツ${typeof log.metadata?.title === 'string' ? `「${log.metadata.title}」` : ''}を作成しました。`
    case 'content_updated':
      return `${actor}さんがコンテンツを更新しました。`
    case 'seed_created':
      return `${actor}さんがシード${typeof log.metadata?.title === 'string' ? `「${log.metadata.title}」` : ''}を取り込みました。`
    case 'seed_updated':
      return `${actor}さんがシードを更新しました。`
    case 'brand_profile_updated':
      return `${actor}さんがブランドプロフィール${typeof log.metadata?.name === 'string' ? `「${log.metadata.name}」` : ''}を更新しました。`
    case 'member_invited':
      return `${actor}さんが${typeof log.metadata?.email === 'string' ? log.metadata.email : 'メンバー'}を招待しました。`
    case 'member_removed':
      return `${actor}さんがワークスペースからメンバーを削除しました。`
    case 'role_changed':
      return `${actor}さんがメンバーの役割を変更しました${typeof log.metadata?.role === 'string' ? `（${log.metadata.role}）` : ''}。`
    case 'draft_edited':
      return `${actor}さんが下書きを更新しました${typeof log.metadata?.channel === 'string' ? `（${log.metadata.channel}）` : typeof log.metadata?.platform === 'string' ? `（${log.metadata.platform}）` : ''}。`
    case 'draft_ai_generated':
      return `${actor}さんがAI提案を生成しました${Array.isArray(log.metadata?.channels) ? `（${log.metadata.channels.join(', ')}）` : ''}。`
    case 'draft_revision_approved':
      return `${actor}さんが下書き${typeof log.metadata?.channel === 'string' ? `（${log.metadata.channel}）` : ''}を承認し、Revisionを記録しました。`
    case 'inbox_reply_ai_generated':
      return `${actor}さんが受信メッセージへのAI返信案を生成しました${typeof log.metadata?.platform === 'string' ? `（${log.metadata.platform}）` : ''}。`
    case 'queue_item_scheduled':
      return log.metadata?.retried
        ? `${actor}さんがキュー項目を再度スケジュールしました。`
        : `${actor}さんが下書きの公開を予約しました${typeof log.metadata?.channel === 'string' ? `（${log.metadata.channel}）` : ''}。`
    case 'queue_item_cancelled':
      return `${actor}さんがキュー項目をキャンセルしました。`
    case 'queue_item_published':
      return `${actor}さんが予約したジョブが公開されました${typeof log.metadata?.channel === 'string' ? `（${log.metadata.channel}）` : ''}。`
    case 'queue_item_failed':
      return `${actor}さんが予約したジョブの公開に失敗しました${typeof log.metadata?.failureReason === 'string' ? `（理由: ${log.metadata.failureReason}）` : ''}。`
    case 'queue_item_manual_completed':
      return `${actor}さんが手動公開を記録しました${typeof log.metadata?.channel === 'string' ? `（${log.metadata.channel}）` : ''}。`
    case 'inbox_item_read':
      return `${actor}さんが受信箱アイテムの既読状態を更新しました。`
    case 'inbox_item_starred':
      return `${actor}さんが受信箱アイテムのスター状態を更新しました。`
    case 'inbox_item_needs_action':
      return `${actor}さんが受信箱アイテムの「要対応」状態を更新しました。`
    case 'inbox_note_added':
      return `${actor}さんが内部メモを追加しました。`
    case 'workspace_settings_updated':
      return `${actor}さんがワークスペース設定を更新しました。`
    case 'social_account_connected':
      return `${actor}さんが${typeof log.metadata?.platform === 'string' ? log.metadata.platform : 'SNSアカウント'}を接続しました${typeof log.metadata?.handle === 'string' ? `（${log.metadata.handle}）` : ''}。`
    case 'social_account_disconnected':
      return `${actor}さんが${typeof log.metadata?.platform === 'string' ? log.metadata.platform : 'SNSアカウント'}の接続を解除しました。`
    case 'line_account_connected':
      return `${actor}さんがLINE公式アカウントを接続しました${typeof log.metadata?.handle === 'string' ? `（${log.metadata.handle}）` : ''}。`
    case 'workspace_data_exported':
      return `${actor}さんがワークスペースデータをエクスポートしました${typeof log.metadata?.seeds === 'number' ? `（シード${log.metadata.seeds}件）` : ''}。`
    default:
      return `${actor}さんがワークスペースを更新しました。`
  }
}

export function getAuditLogMeta(log: AuditLog): string {
  return formatTimestamp(log.createdAt)
}
