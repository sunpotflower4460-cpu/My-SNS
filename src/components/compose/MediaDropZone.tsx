'use client'

import { type RefObject } from 'react'
import { ImagePlus } from 'lucide-react'
import { formatBytes } from '@/lib/seeds/input'

export interface PendingMedia {
  id: string
  name: string
  size: number
  type: string
  previewUrl?: string
}

interface MediaDropZoneProps {
  assets: PendingMedia[]
  onAddFiles: (files: FileList | null) => void
  onRemove: (id: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  disabled?: boolean
}

export default function MediaDropZone({ assets, onAddFiles, onRemove, inputRef, disabled }: MediaDropZoneProps) {
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (!disabled) onAddFiles(event.dataTransfer.files)
        }}
        className="flex min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-container border border-dashed border-[color:rgba(109,93,246,0.28)] bg-[color:rgba(109,93,246,0.05)] px-4 py-6 text-center transition duration-200 ease-[var(--ease-out-premium)] hover:bg-[color:rgba(109,93,246,0.08)] disabled:opacity-60"
      >
        <ImagePlus aria-hidden className="h-7 w-7 text-[color:var(--accent)]" />
        <p className="text-sm font-semibold text-[color:var(--text-strong)]">写真・動画を入れる</p>
        <p className="max-w-xs text-xs leading-5 text-[color:var(--text-muted)]">タップするか、ファイルをここにドロップ。あとから文章を足せます。</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onAddFiles(event.target.files)
          event.currentTarget.value = ''
        }}
      />
      {assets.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {assets.map((asset) => (
            <li key={asset.id} className="relative overflow-hidden rounded-card border border-[color:var(--border-default)] bg-white">
              {asset.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.previewUrl} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-black/[0.03] px-2 text-center text-[11px] text-[color:var(--text-muted)]">
                  {asset.type}
                </div>
              )}
              <p className="truncate px-2 py-1 text-[10px] text-[color:var(--text-subtle)]">{asset.name}</p>
              <p className="px-2 pb-2 text-[10px] text-[color:var(--text-subtle)]">{formatBytes(asset.size)}</p>
              <button
                type="button"
                onClick={() => onRemove(asset.id)}
                className="absolute right-1 top-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
