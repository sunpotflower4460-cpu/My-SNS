import type { Asset, PublishingChannel } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

export type AssetPublishingAssignments = Record<string, PublishingChannel[]>

interface AssetPublishingRow {
  id: string
  publishing_channels?: PublishingChannel[] | null
}

function normalizeAssignments(rows: AssetPublishingRow[]): AssetPublishingAssignments {
  return Object.fromEntries(rows.map((row) => [row.id, row.publishing_channels ?? []]))
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

  if (error) {
    // Fail open to the historical behavior (all Seed assets available) if a
    // deployment has not applied the new migration yet. Posting must not start
    // silently dropping media because assignment metadata was unavailable.
    console.error('Error fetching asset publishing assignments:', error)
    return {}
  }

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

  if (error) {
    console.error('Error fetching Seed asset publishing assignments:', error)
    return {}
  }

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
