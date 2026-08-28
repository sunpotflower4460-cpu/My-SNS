import type { Asset, AssetAspectRatio, AssetMediaRole, PublishingChannel } from '@/lib/domain/types'
import type { AssetUploadInput } from '@/lib/storage/interfaces'
import { SupabaseAssetStorage } from '@/lib/storage/supabase/supabase-asset-storage'
import { createClient } from '@/lib/supabase/client'
import { detectFileAspectRatio, suggestedPublishingChannelsForAspect } from '@/lib/media/aspect'

export async function appendSeedAssets(params: {
  workspaceId: string
  seedId: string
  files: File[]
  mediaRole?: AssetMediaRole
  sourceAssetId?: string
  publishingChannels?: PublishingChannel[]
  aspectRatio?: AssetAspectRatio
}): Promise<Asset[]> {
  if (params.files.length === 0) return []

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ログインしていません。')

  const storage = new SupabaseAssetStorage()
  const inputs: AssetUploadInput[] = params.files.map((file) => ({ file }))
  const prepared = await storage.prepareFiles(inputs, {
    workspaceId: params.workspaceId,
    seedId: params.seedId,
  })

  const saved: Asset[] = []
  for (const preparedAsset of prepared) {
    const aspectRatio = params.aspectRatio ?? await detectFileAspectRatio(preparedAsset.file)
    const publishingChannels = params.publishingChannels
      ?? suggestedPublishingChannelsForAspect(aspectRatio, preparedAsset.type)
    saved.push(await storage.saveAssetMetadata({
      workspaceId: params.workspaceId,
      seedId: params.seedId,
      uploadedBy: user.id,
      preparedAsset: {
        ...preparedAsset,
        aspectRatio: aspectRatio ?? undefined,
        mediaRole: params.mediaRole ?? 'source',
        sourceAssetId: params.sourceAssetId,
        publishingChannels,
      },
    }))
  }

  return saved
}

export async function deleteSeedAsset(params: {
  workspaceId: string
  seedId: string
  assetId: string
}): Promise<void> {
  const supabase = createClient()

  const { data: asset, error: lookupError } = await supabase
    .from('assets')
    .select('id, storage_path')
    .eq('id', params.assetId)
    .eq('workspace_id', params.workspaceId)
    .eq('seed_id', params.seedId)
    .single()

  if (lookupError || !asset) {
    throw new Error('削除する素材が見つかりません。')
  }

  // Remove private storage first so a successful metadata delete can never
  // leave a hidden blob consuming storage. Storage DELETE RLS is intentionally
  // kept identical to the assets-table delete roles (owner/admin/editor), so a
  // contributor can no longer remove only the blob and strand its metadata.
  if (asset.storage_path) {
    const { error: storageError } = await supabase.storage.from('assets').remove([asset.storage_path])
    if (storageError) throw new Error(`素材ファイルを削除できませんでした: ${storageError.message}`)
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('assets')
    .delete()
    .eq('id', params.assetId)
    .eq('workspace_id', params.workspaceId)
    .eq('seed_id', params.seedId)
    .select('id')
    .maybeSingle()

  if (deleteError) throw new Error(`素材情報を削除できませんでした: ${deleteError.message}`)
  if (deleted) return

  // A concurrent deletion can legitimately make DELETE return no row. Verify
  // that the metadata is actually gone before calling that a success; if it is
  // still visible, this was an authorization-filtered/no-op delete and the UI
  // must not claim otherwise.
  const { data: remaining, error: verifyError } = await supabase
    .from('assets')
    .select('id')
    .eq('id', params.assetId)
    .eq('workspace_id', params.workspaceId)
    .eq('seed_id', params.seedId)
    .maybeSingle()

  if (verifyError) {
    throw new Error(`素材情報の削除結果を確認できませんでした: ${verifyError.message}`)
  }
  if (remaining) {
    throw new Error('素材ファイルは削除されましたが、素材情報を削除する権限がありません。再読み込みして管理者に確認してください。')
  }
}
