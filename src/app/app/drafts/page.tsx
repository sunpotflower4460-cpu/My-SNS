'use client'

import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import DraftEditorCard from '@/components/ui/DraftEditorCard'
import EmptyState from '@/components/ui/EmptyState'
import { MOCK_CONTENTS, MOCK_SOCIAL_DRAFTS } from '@/lib/mock/seed'
import { MockAiDraftGeneratorService } from '@/lib/services/ai-draft'
import type { SocialPlatform, SocialDraft } from '@/lib/domain/types'

const PLATFORMS: SocialPlatform[] = ['youtube', 'instagram', 'threads', 'x', 'tiktok', 'facebook']
const TONES = ['casual', 'professional', 'playful', 'inspirational']

const aiService = new MockAiDraftGeneratorService()

export default function DraftsPage() {
  const [contentId, setContentId] = useState(MOCK_CONTENTS[0]?.id ?? '')
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['instagram', 'x'])
  const [tone, setTone] = useState('casual')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('short')
  const [generatedDrafts, setGeneratedDrafts] = useState<SocialDraft[]>([])
  const [loading, setLoading] = useState(false)

  const existingDrafts = MOCK_SOCIAL_DRAFTS

  const togglePlatform = (p: SocialPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  const handleGenerate = async () => {
    const content = MOCK_CONTENTS.find((c) => c.id === contentId)
    if (!content) return
    setLoading(true)
    const drafts = await aiService.generateDrafts(content, selectedPlatforms, tone, length)
    setGeneratedDrafts(drafts)
    setLoading(false)
  }

  const handleEdit = (id: string, text: string) => {
    setGeneratedDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, draftText: text, updatedAt: new Date().toISOString() } : d)),
    )
  }

  const handleApprove = (id: string) => {
    setGeneratedDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'approved' as const } : d)),
    )
  }

  return (
    <div>
      <PageHeader
        title="AI Draft Studio"
        description="Generate platform-tailored social media drafts from your content."
      />

      {/* Generator Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source Content</label>
            <select
              value={contentId}
              onChange={(e) => setContentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              {MOCK_CONTENTS.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as 'short' | 'medium' | 'long')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedPlatforms.includes(p)
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || selectedPlatforms.length === 0}
          className="bg-violet-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? 'Generating...' : '✨ Generate Drafts'}
        </button>
      </div>

      {/* Generated Drafts */}
      {generatedDrafts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Generated Drafts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {generatedDrafts.map((draft) => (
              <DraftEditorCard
                key={draft.id}
                draft={draft}
                onEdit={handleEdit}
                onApprove={handleApprove}
                onRegenerate={handleGenerate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Existing Drafts */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Saved Drafts</h2>
        {existingDrafts.length === 0 ? (
          <EmptyState
            title="No drafts yet"
            description="Generate your first draft above."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {existingDrafts.map((draft) => (
              <DraftEditorCard key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
