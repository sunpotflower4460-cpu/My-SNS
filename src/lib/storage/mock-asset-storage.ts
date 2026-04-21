import { inferAssetType } from '@/lib/mock/repositories/helpers'
import type { AssetStorageAdapter, AssetUploadInput, PreparedAssetUpload } from './interfaces'

async function buildPreview(file: File) {
  if (!file.type.startsWith('image/')) {
    return undefined
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error(`Unable to preview ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

export class MockAssetStorageAdapter implements AssetStorageAdapter {
  async prepareFiles(inputs: AssetUploadInput[]): Promise<PreparedAssetUpload[]> {
    return Promise.all(
      inputs.map(async ({ file }) => {
        const previewUrl = await buildPreview(file).catch(() => undefined)

        return {
          name: file.name,
          size: file.size,
          type: inferAssetType(file.name, file.type),
          url: previewUrl,
          previewUrl,
        }
      }),
    )
  }
}
