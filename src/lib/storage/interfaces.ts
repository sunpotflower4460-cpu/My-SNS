export interface AssetUploadInput {
  file: File
}

export interface AssetUploadContext {
  workspaceId: string
  seedId: string
}

export interface PreparedAssetUpload {
  file: File
  name: string
  size: number
  type: 'image' | 'video' | 'audio' | 'document'
  storagePath: string
  url?: string
  previewUrl?: string
  aspectRatio?: '16:9' | '9:16' | '1:1' | 'other'
  mediaRole?: 'source' | 'variant' | 'thumbnail' | 'cover' | 'eyecatch'
  sourceAssetId?: string
  publishingChannels?: import('@/lib/domain/types').PublishingChannel[]
}

export interface AssetStorageAdapter {
  prepareFiles(inputs: AssetUploadInput[], context: AssetUploadContext): Promise<PreparedAssetUpload[]>
}
