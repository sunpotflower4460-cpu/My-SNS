'use client'

import { useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import ContentCard from '@/components/ui/ContentCard'
import EmptyState from '@/components/ui/EmptyState'
import { MOCK_CONTENTS } from '@/lib/mock/seed'
import type { ContentType } from '@/lib/domain/types'
import { useRouter } from 'next/navigation'

const TYPE_FILTERS: Array<{ label: string; value: ContentType | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Music', value: 'music' },
  { label: 'Video', value: 'video' },
  { label: 'Image', value: 'image' },
  { label: 'Text', value: 'text' },
  { label: 'Mixed', value: 'mixed' },
]

export default function ContentPage() {
  const router = useRouter()
  const [activeType, setActiveType] = useState<ContentType | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = MOCK_CONTENTS.filter((c) => {
    const matchesType = activeType === 'all' || c.type === activeType
    const matchesSearch =
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    return matchesType && matchesSearch
  })

  return (
    <div>
      <PageHeader
        title="Content Library"
        description="Manage all your content in one place."
        actions={
          <Link
            href="/app/content/new"
            className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"
          >
            + New Content
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveType(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeType === f.value
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search content..."
          className="ml-auto px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
      </div>

      {/* Content Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No content found"
          description="Try adjusting your filters or create something new."
          action={
            <Link
              href="/app/content/new"
              className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"
            >
              Create content
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((content) => (
            <ContentCard
              key={content.id}
              content={content}
              onClick={() => router.push(`/app/content/${content.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
