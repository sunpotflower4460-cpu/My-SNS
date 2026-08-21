import type { AssetStorageAdapter, AssetUploadContext, AssetUploadInput, PreparedAssetUpload } from '../interfaces'
import { createClient } from '@/lib/supabase/client'
import type { Asset } from '@/lib/domain/types'
import { inferAssetType } from '@/lib/seeds/input'
import { buildAssetStoragePath } from '@/lib/storage/asset-path'

export class SupabaseAssetStorage implements AssetStorageAdapter {
  private supabase = createClient()
  private bucketName = 'assets'

  async prepareFiles(inputs: AssetUploadInput[], context: AssetUploadContext): Promise<PreparedAssetUpload[]> {
    return inputs.map((input) => {
      const file = input.file
      const assetType = inferAssetType(file.name, file.type)
      const storagePath = buildAssetStoragePath({
        workspaceId: context.workspaceId,
        seedId: context.seedId,
        assetId: crypto.randomUUID(),
        fileName: file.name,
      })

      return {
        file,
        name: file.name,
        size: file.size,
        type: assetType,
        storagePath,
      }
    })
  }

  async saveAssetMetadata(params: {
    workspaceId: string
    seedId?: string
    uploadedBy: string
    preparedAsset: PreparedAssetUpload
  }): Promise<Asset> {
    const preparedAsset = params.preparedAsset
    const { data: uploaded, error: uploadError } = await this.supabase.storage
      .from(this.bucketName)
      .upload(preparedAsset.storagePath, preparedAsset.file, {
        cacheControl: '3600',
        contentType: preparedAsset.file.type || undefined,
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Unable to upload ${preparedAsset.name}: ${uploadError.message}`)
    }

    try {
      const { data: signedUrlData } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(uploaded.path, 60 * 60)

      const { data, error } = await this.supabase
        .from('assets')
        .insert({
          workspace_id: params.workspaceId,
          seed_id: params.seedId,
          name: preparedAsset.name,
          url: '',
          storage_path: uploaded.path,
          type: preparedAsset.type,
          size: preparedAsset.size,
          uploaded_by: params.uploadedBy,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      return {
        id: data.id,
        workspaceId: data.workspace_id,
        seedId: data.seed_id,
        name: data.name,
        url: signedUrlData?.signedUrl || data.url,
        storagePath: data.storage_path,
        type: data.type,
        size: data.size,
        uploadedBy: data.uploaded_by,
        createdAt: data.created_at,
      }
    } catch (cause) {
      const { error: cleanupError } = await this.supabase.storage
        .from(this.bucketName)
        .remove([uploaded.path])

      if (cleanupError) {
        console.error('Unable to clean up uploaded asset after metadata failure:', cleanupError)
      }

      throw cause instanceof Error ? cause : new Error('Unable to save asset metadata.')
    }
  }
}
