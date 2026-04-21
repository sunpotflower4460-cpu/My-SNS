import type { AssetStorageAdapter, AssetUploadInput, PreparedAssetUpload } from '../interfaces'
import { createClient } from '@/lib/supabase/client'
import type { Asset } from '@/lib/domain/types'

export class SupabaseAssetStorage implements AssetStorageAdapter {
  private supabase = createClient()
  private bucketName = 'assets'

  async prepareFiles(inputs: AssetUploadInput[]): Promise<PreparedAssetUpload[]> {
    const prepared: PreparedAssetUpload[] = []

    for (const input of inputs) {
      try {
        const file = input.file
        const fileExt = file.name.split('.').pop() || ''
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = fileName

        // Determine asset type
        let assetType: 'image' | 'video' | 'audio' | 'document' = 'document'
        if (file.type.startsWith('image/')) {
          assetType = 'image'
        } else if (file.type.startsWith('video/')) {
          assetType = 'video'
        } else if (file.type.startsWith('audio/')) {
          assetType = 'audio'
        }

        // Upload to Supabase Storage
        const { data, error } = await this.supabase.storage
          .from(this.bucketName)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (error) {
          console.error('Upload error:', error)
          continue
        }

        // Get public URL
        const { data: urlData } = this.supabase.storage
          .from(this.bucketName)
          .getPublicUrl(data.path)

        const publicUrl = urlData.publicUrl

        // For images, create a preview URL
        let previewUrl: string | undefined
        if (assetType === 'image' && file.size < 10 * 1024 * 1024) {
          // For images under 10MB, use the URL directly as preview
          previewUrl = publicUrl
        }

        prepared.push({
          name: file.name,
          size: file.size,
          type: assetType,
          url: publicUrl,
          previewUrl,
        })
      } catch (error) {
        console.error('Error preparing file:', error)
      }
    }

    return prepared
  }

  async saveAssetMetadata(params: {
    workspaceId: string
    contentId?: string
    uploadedBy: string
    preparedAsset: PreparedAssetUpload
  }): Promise<Asset> {
    const { data, error } = await this.supabase
      .from('assets')
      .insert({
        workspace_id: params.workspaceId,
        content_id: params.contentId,
        name: params.preparedAsset.name,
        url: params.preparedAsset.url || '',
        type: params.preparedAsset.type,
        size: params.preparedAsset.size,
        uploaded_by: params.uploadedBy,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      contentId: data.content_id,
      name: data.name,
      url: data.url,
      type: data.type,
      size: data.size,
      uploadedBy: data.uploaded_by,
      createdAt: data.created_at,
    }
  }
}
