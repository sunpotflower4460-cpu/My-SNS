import type { Asset, PublishingChannel } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export type AssetPublishingAssignments = Record<string, PublishingChannel[]>

interface AssetPublishingRow {
  id: string
  publishing_channels?: PublishingChannel[] | null
}

interface AssignmentReadError {
  code?: string | null
  message?: string | null
}

function normalizeAssignments(rows: AssetPublishingRow[]): AssetPublishingAssignments {
  return Object.fromEntries(rows.map((row) => [row.id, row.publishing_channels ?? []]))
}

function isMissingAssignmentColumn(error: AssignmentReadError): boolean {
  const message = error.message?.toLowerCase() ?? ''
  return error.code === '42703'
    || (message.includes('publishing_channels') && (message.includes('does not exist') || message.includes('schema cache')))
}

function handleAssignmentReadError(error: AssignmentReadError, context: string): AssetPublishingAssignments {
  // Only a deployment that has not applied the additive migration may retain
  // historical all-assets behavior. Once assignments exist, transient network,
  // auth, or database errors must fail closed so the wrong channel never gets
  // another channel's media by accident.
  if (isMissingAssignmentColumn(error)) {
    console.warn(`${context}: publishing_channels migration is not applied; using legacy all-channel asset behavior.`)
    return {}
  }

  throw new Error('素材の投稿先設定を確認できませんでした。ページを更新して再試行してください。')
}

/**
 * Missing/empty assignments deliberately mean "all channels" for backwards
 * compatibility with every asset created before channel-specific assignment.
 */
export function selectAssetsForPublishingChannel(
  assets: Asset[],
  assignments: AssetPublishingAssignments,
  channel: PublishingChannel,
): Asset[] {
  return assets.filter((asset) => {
    const channels = assignments[asset.id] ?? []
    return channels.length === 0 || channels.includes(channel)
  })
}

export async function listAssetPublishingAssignments(assetIds: string[]): Promise<AssetPublishingAssignments> {
  const uniqueIds = Array.from(new Set(assetIds)).filter(Boolean)
  if (uniqueIds.length === 0) return {}

  const supabase = createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('id, publishing_channels')
    .in('id', uniqueIds)

  if (error) return handleAssignmentReadError(error, 'Error fetching asset publishing assignments')

  return normalizeAssignments((data ?? []) as AssetPublishingRow[])
}

export async function listSeedAssetPublishingAssignments(params: {
  workspaceId: string
  seedId: string
}): Promise<AssetPublishingAssignments> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('id, publishing_channels')
    .eq('workspace_id', params.workspaceId)
    .eq('seed_id', params.seedId)

  if (error) return handleAssignmentReadError(error, 'Error fetching Seed asset publishing assignments')

  return normalizeAssignments((data ?? []) as AssetPublishingRow[])
}

export async function updateSeedAssetPublishingChannels(params: {
  assetId: string
  channels: PublishingChannel[]
}): Promise<void> {
  const supabase = createClient()
  const channels = Array.from(new Set(params.channels))
  const { error } = await supabase.rpc('set_asset_publishing_channels', {
    asset_uuid: params.assetId,
    channels,
  })

  if (error) throw new Error(`素材の投稿先を保存できませんでした: ${error.message}`)
}
