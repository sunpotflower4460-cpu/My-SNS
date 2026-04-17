'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import ContentCard from '@/components/ui/ContentCard'
import EmptyState from '@/components/ui/EmptyState'
import { useMockApp } from '@/lib/mock/store/provider'
import type { ContentType } from '@/lib/domain/types'

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
  const { contents, currentWorkspace } = useMockApp()
  const [activeType, setActiveType] = useState<ContentType | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      contents.filter((content) => {
        const matchesType = activeType === 'all' || content.type === activeType
        const matchesSearch =
          !search ||
          content.title.toLowerCase().includes(search.toLowerCase()) ||
          content.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
        return matchesType && matchesSearch
      }),
    [activeType, contents, search],
  )

  return (
    <div>
      <PageHeader
        title="Content Library"
        description={`Everything for ${currentWorkspace?.name ?? 'this workspace'} in one place.`}
        actions={
          <Link
            href="/app/content/new"
            className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
          >
            + New Content
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setActiveType(filter.value)}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                activeType === filter.value
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search content or tags…"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 lg:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No content found"
          description="Try adjusting the filters, switching workspaces, or starting a new entry."
          action={
            <Link href="/app/content/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
              Create content
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((content) => (
            <ContentCard key={content.id} content={content} onClick={() => router.push(`/app/content/${content.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
