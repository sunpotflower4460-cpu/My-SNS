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
