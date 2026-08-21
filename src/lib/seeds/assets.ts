import type { Asset } from '@/lib/domain/types'
import type { AssetUploadInput } from '@/lib/storage/interfaces'
import { SupabaseAssetStorage } from '@/lib/storage/supabase/supabase-asset-storage'
import { createClient } from '@/lib/supabase/client'

export async function appendSeedAssets(params: {
  workspaceId: string
  seedId: string
  files: File[]
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
    saved.push(await storage.saveAssetMetadata({
      workspaceId: params.workspaceId,
      seedId: params.seedId,
      uploadedBy: user.id,
      preparedAsset,
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
  // leave a hidden blob consuming storage. Retrying is safe if metadata
  // deletion later fails, because Supabase remove tolerates a missing object.
  if (asset.storage_path) {
    const { error: storageError } = await supabase.storage.from('assets').remove([asset.storage_path])
    if (storageError) throw new Error(`素材ファイルを削除できませんでした: ${storageError.message}`)
  }

  const { error: deleteError } = await supabase
    .from('assets')
    .delete()
    .eq('id', params.assetId)
    .eq('workspace_id', params.workspaceId)
    .eq('seed_id', params.seedId)

  if (deleteError) throw new Error(`素材情報を削除できませんでした: ${deleteError.message}`)
}
