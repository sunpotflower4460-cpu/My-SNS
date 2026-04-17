'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { MOCK_ASSETS } from '@/lib/mock/seed'
import type { ContentType, ContentStatus } from '@/lib/domain/types'

export default function NewContentPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<ContentType>('text')
  const [tags, setTags] = useState('')
  const [status, setStatus] = useState<ContentStatus>('draft')
  const [saved, setSaved] = useState(false)

  const handleSave = (targetStatus: ContentStatus) => {
    const payload = {
      title,
      body,
      type,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      status: targetStatus,
    }
    console.log('[NewContent] Save:', payload)
    setSaved(true)
    setTimeout(() => {
      router.push('/app/content')
    }, 1200)
  }

  return (
    <div>
      <PageHeader
        title="New Content"
        description="Create a new piece of content for your workspace."
        actions={
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
        }
      />

      {saved && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
          ✓ Saved! Redirecting...
        </div>
      )}

      <div className="max-w-2xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your content a title"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the main description or body of this content..."
            rows={5}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ContentType)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <option value="text">Text</option>
              <option value="music">Music</option>
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentStatus)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="music, release, ep  (comma-separated)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>

        {/* Asset Attach Area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Assets</label>
          <div className="border border-dashed border-gray-300 rounded-xl p-5 bg-gray-50">
            <EmptyState
              title="No assets attached"
              description="Upload files to attach to this content."
              action={
                <button className="text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50">
                  Upload asset (Phase 2)
                </button>
              }
            />
          </div>
          {MOCK_ASSETS.slice(0, 2).map((asset) => (
            <div key={asset.id} className="flex items-center gap-3 mt-2 p-3 bg-white border border-gray-200 rounded-lg">
              <span className="text-sm">📎</span>
              <span className="text-sm text-gray-700 flex-1">{asset.name}</span>
              <span className="text-xs text-gray-400">{(asset.size / 1024).toFixed(0)} KB</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => handleSave('draft')}
            className="bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave('ready')}
            className="bg-violet-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-violet-700"
          >
            Save & Mark Ready
          </button>
        </div>
      </div>
    </div>
  )
}
