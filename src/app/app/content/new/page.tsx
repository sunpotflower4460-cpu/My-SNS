'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { formatBytes, normalizeTags } from '@/lib/mock/repositories/helpers'
import { useMockApp } from '@/lib/mock/store/provider'
import type { ContentStatus, ContentType } from '@/lib/domain/types'
import { MockAssetStorageAdapter } from '@/lib/storage/mock-asset-storage'
import type { PreparedAssetUpload } from '@/lib/storage/interfaces'

type PendingAsset = PreparedAssetUpload & { id: string }

const assetStorage = new MockAssetStorageAdapter()

export default function NewContentPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isMountedRef = useRef(true)
  const { createContentItem, currentWorkspace } = useMockApp()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<ContentType>('text')
  const [tags, setTags] = useState('')
  const [status, setStatus] = useState<ContentStatus>('draft')
  const [assets, setAssets] = useState<PendingAsset[]>([])
  const [previewWarning, setPreviewWarning] = useState('')

  const normalizedTags = useMemo(() => normalizeTags(tags), [tags])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setPreviewWarning('')

    const preparedAssets = await assetStorage.prepareFiles(
      Array.from(files).map((file) => ({ file })),
    )
    const nextAssets = preparedAssets.map((asset) => ({
      ...asset,
      id: `${asset.name}-${asset.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }))

    if (isMountedRef.current && preparedAssets.some((asset) => asset.type === 'image' && !asset.previewUrl)) {
      setPreviewWarning('One or more image previews could not be generated, but the files were still attached.')
    }

    setAssets((prev) => [...prev, ...nextAssets])
  }

  const handleSave = (targetStatus: ContentStatus) => {
    const content = createContentItem({
      title,
      body,
      type,
      status: targetStatus,
      tags: normalizedTags,
      assets: assets.map((asset) => ({
        name: asset.name,
        size: asset.size,
        type: asset.type,
        url: asset.url,
      })),
    })

    router.push(`/app/content/${content.id}`)
  }

  const canSave = title.trim().length > 0 && body.trim().length > 0

  return (
    <div>
      <PageHeader
        title="New Content"
        description={`Create a new entry for ${currentWorkspace?.name ?? 'this workspace'} and attach lightweight local assets.`}
        actions={
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back
          </button>
        }
      />

      {previewWarning && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {previewWarning}
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
                onChange={(event) => handleFiles(event.target.files)}
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
                  description="Select files from your device to attach lightweight mock metadata to this entry."
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
                        <button onClick={() => setAssets((prev) => prev.filter((entry) => entry.id !== asset.id))} className="text-xs text-gray-500 hover:text-red-600">Remove</button>
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
              disabled={!canSave}
              className="rounded-2xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              onClick={() => handleSave('ready')}
              disabled={!canSave}
              className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save & Mark Ready
            </button>
            <span className="text-xs text-gray-500">Saved items stay attached to {currentWorkspace?.name ?? 'this workspace'}.</span>
          </div>
        </section>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="text-base font-semibold text-gray-900">Preview</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">A quick read on what will be saved into the mock repository.</p>
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
