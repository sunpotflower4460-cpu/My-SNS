'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { formatBytes, inferAssetType, normalizeTags } from '@/lib/content/utils'
import { useApp } from '@/lib/app/app-provider'
import type { AssetType, ContentStatus, ContentType } from '@/lib/domain/types'

type PendingAsset = {
  id: string
  file: File
  name: string
  size: number
  type: AssetType
  previewUrl?: string
}

export default function NewContentPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const assetsRef = useRef<PendingAsset[]>([])
  const { createContentItem, currentWorkspace } = useApp()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<ContentType>('text')
  const [tags, setTags] = useState('')
  const [status, setStatus] = useState<ContentStatus>('draft')
  const [assets, setAssets] = useState<PendingAsset[]>([])
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const normalizedTags = useMemo(() => normalizeTags(tags), [tags])

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  useEffect(() => {
    return () => {
      for (const asset of assetsRef.current) {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl)
      }
    }
  }, [])

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    setError('')

    const nextAssets = Array.from(files).map((file) => {
      const type = inferAssetType(file.name, file.type)
      return {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type,
        previewUrl: type === 'image' ? URL.createObjectURL(file) : undefined,
      }
    })

    setAssets((prev) => [...prev, ...nextAssets])
  }

  const removeAsset = (assetId: string) => {
    setAssets((current) => {
      const target = current.find((asset) => asset.id === assetId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return current.filter((asset) => asset.id !== assetId)
    })
  }

  const handleSave = async (targetStatus: ContentStatus) => {
    setIsSaving(true)
    setError('')

    try {
      const content = await createContentItem({
        title,
        body,
        type,
        status: targetStatus,
        tags: normalizedTags,
        assets: assets.map((asset) => ({ file: asset.file })),
      })

      router.push(`/app/content/${content.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this content.')
      setIsSaving(false)
    }
  }

  const canSave = title.trim().length > 0 && (body.trim().length > 0 || assets.length > 0)

  return (
    <div>
      <PageHeader
        title="New Content"
        description={`Create a new entry for ${currentWorkspace?.name ?? 'this workspace'} and attach files to private workspace storage.`}
        actions={
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back
          </button>
        }
      />

      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <section className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Give your content a title"
              className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Body</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the main description or body of this content…"
              rows={7}
              className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ContentType)}
                className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="text">Text</option>
                <option value="music">Music</option>
                <option value="video">Video</option>
                <option value="image">Image</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ContentStatus)}
                className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
              </select>
              <p className="mt-2 text-xs text-gray-500">
                {status === 'draft'
                  ? 'Draft keeps this item in progress for later edits.'
                  : 'Ready marks the item as prepared for draft generation or scheduling.'}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Tags</label>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="music, release, ep"
              className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {normalizedTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {normalizedTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">Assets</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                onChange={(event) => {
                  handleFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-stone-50"
              >
                Attach files
              </button>
            </div>
            <div className="rounded-[1.75rem] border border-dashed border-stone-300 bg-stone-50 p-5">
              {assets.length === 0 ? (
                <EmptyState
                  title="No assets attached"
                  description="Select files from your device. They are uploaded only when you save this entry."
                  action={<button onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-stone-50">Browse files</button>}
                />
              ) : (
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <div key={asset.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                      <div className="flex items-start gap-4">
                        {asset.previewUrl ? (
                          <div
                            aria-label={asset.name}
                            className="h-16 w-16 rounded-2xl bg-cover bg-center"
                            style={{ backgroundImage: `url(${asset.previewUrl})` }}
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100 text-2xl">📎</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{asset.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{asset.type} · {formatBytes(asset.size)}</p>
                        </div>
                        <button onClick={() => removeAsset(asset.id)} className="text-xs text-gray-500 hover:text-red-600">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => handleSave('draft')}
              disabled={!canSave || isSaving}
              className="rounded-2xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSave('ready')}
              disabled={!canSave || isSaving}
              className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save & Mark Ready'}
            </button>
            <span className="text-xs text-gray-500">Saved items stay attached to {currentWorkspace?.name ?? 'this workspace'}.</span>
          </div>
        </section>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="text-base font-semibold text-gray-900">Preview</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">A quick read on what will be saved to this workspace.</p>
          <div className="mt-5 space-y-4 rounded-[1.75rem] border border-stone-200 bg-stone-50 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Title</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{title || 'Untitled content'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Body</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{body || 'Add a description, announcement, or creative note.'}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 capitalize">{type}</span>
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 capitalize">{status}</span>
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1">{assets.length} assets</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
