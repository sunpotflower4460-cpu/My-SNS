import type { AssetStorageAdapter, AssetUploadContext, AssetUploadInput, PreparedAssetUpload } from '../interfaces'
import { createClient } from '@/lib/supabase/client'
import type { Asset } from '@/lib/domain/types'
import { inferAssetType } from '@/lib/seeds/input'
import { buildAssetStoragePath } from '@/lib/storage/asset-path'

export class SupabaseAssetStorage implements AssetStorageAdapter {
  private supabase = createClient()
  private bucketName = 'assets'

  async prepareFiles(inputs: AssetUploadInput[], context: AssetUploadContext): Promise<PreparedAssetUpload[]> {
    const prepared: PreparedAssetUpload[] = []

    for (const input of inputs) {
      const file = input.file
      const assetType = inferAssetType(file.name, file.type)
      const filePath = buildAssetStoragePath({
        workspaceId: context.workspaceId,
        seedId: context.seedId,
        assetId: crypto.randomUUID(),
        fileName: file.name,
      })

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: file.type || undefined,
          upsert: false,
        })

      if (error) {
        throw new Error(`Unable to upload ${file.name}: ${error.message}`)
      }

      const { data: signedUrlData } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(data.path, 60 * 60)

      prepared.push({
        name: file.name,
        size: file.size,
        type: assetType,
        storagePath: data.path,
        url: signedUrlData?.signedUrl,
        previewUrl: assetType === 'image' ? signedUrlData?.signedUrl : undefined,
      })
    }

    return prepared
  }

  async saveAssetMetadata(params: {
    workspaceId: string
    seedId?: string
    uploadedBy: string
    preparedAsset: PreparedAssetUpload
  }): Promise<Asset> {
    const { data, error } = await this.supabase
      .from('assets')
      .insert({
        workspace_id: params.workspaceId,
        seed_id: params.seedId,
        name: params.preparedAsset.name,
        url: '',
        storage_path: params.preparedAsset.storagePath,
        type: params.preparedAsset.type,
        size: params.preparedAsset.size,
        uploaded_by: params.uploadedBy,
      })
      .select()
      .single()

    if (error) {
      await this.supabase.storage.from(this.bucketName).remove([params.preparedAsset.storagePath])
      throw new Error(error.message)
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      seedId: data.seed_id,
      name: data.name,
      url: params.preparedAsset.url || data.url,
      storagePath: data.storage_path,
      type: data.type,
      size: data.size,
      uploadedBy: data.uploaded_by,
      createdAt: data.created_at,
    }
  }
}
