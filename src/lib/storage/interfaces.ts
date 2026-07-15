export interface AssetUploadInput {
  file: File
}

export interface AssetUploadContext {
  workspaceId: string
  seedId: string
}

export interface PreparedAssetUpload {
  name: string
  size: number
  type: 'image' | 'video' | 'audio' | 'document'
  storagePath: string
  url?: string
  previewUrl?: string
}

export interface AssetStorageAdapter {
  prepareFiles(inputs: AssetUploadInput[], context: AssetUploadContext): Promise<PreparedAssetUpload[]>
}
