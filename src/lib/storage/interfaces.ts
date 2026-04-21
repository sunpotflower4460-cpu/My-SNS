export interface AssetUploadInput {
  file: File
}

export interface PreparedAssetUpload {
  name: string
  size: number
  type: 'image' | 'video' | 'audio' | 'document'
  url?: string
  previewUrl?: string
}

export interface AssetStorageAdapter {
  prepareFiles(inputs: AssetUploadInput[]): Promise<PreparedAssetUpload[]>
}
