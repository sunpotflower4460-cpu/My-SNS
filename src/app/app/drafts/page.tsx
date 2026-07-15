'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import DraftEditorCard from '@/components/ui/DraftEditorCard'
import EmptyState from '@/components/ui/EmptyState'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useApp } from '@/lib/app/app-provider'
import { resetTemplateDraft, TemplateDraftGeneratorService } from '@/lib/services/ai-draft'
import type { SocialDraft, SocialPlatform } from '@/lib/domain/types'

const PLATFORMS: SocialPlatform[] = ['youtube', 'instagram', 'threads', 'x', 'tiktok', 'facebook']
const TONES = ['casual', 'professional', 'playful', 'inspirational']
const draftService = new TemplateDraftGeneratorService()

export default function DraftsPage() {
  const { approveDraft, contents, currentWorkspace, drafts, getDraftsForContent, saveDraft } = useApp()
  const { currentUser } = useCurrentUser()
  const [contentId, setContentId] = useState(contents[0]?.id ?? '')
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['instagram', 'x'])
  const [tone, setTone] = useState('casual')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('short')
  const [generatedDrafts, setGeneratedDrafts] = useState<SocialDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (contents.length > 0 && !contents.some((content) => content.id === contentId)) {
      setContentId(contents[0].id)
    }
  }, [contentId, contents])

  const selectedContent = useMemo(() => contents.find((content) => content.id === contentId) ?? null, [contentId, contents])
  const existingDrafts = useMemo(() => (contentId ? getDraftsForContent(contentId) : drafts), [contentId, drafts, getDraftsForContent])
  const draftsByPlatform = useMemo(
    () =>
      existingDrafts.reduce<Record<string, SocialDraft[]>>((accumulator, draft) => {
        accumulator[draft.platform] = [...(accumulator[draft.platform] ?? []), draft]
        return accumulator
      }, {}),
    [existingDrafts],
  )

  const togglePlatform = (platform: SocialPlatform) => {
    setSelectedPlatforms((prev) => (prev.includes(platform) ? prev.filter((value) => value !== platform) : [...prev, platform]))
  }

  const handleGenerate = async () => {
    if (!selectedContent) return
    setLoading(true)
    setError('')
    try {
      const nextDrafts = await draftService.generateDrafts(selectedContent, selectedPlatforms, tone, length, {
        workspaceName: currentWorkspace?.name,
        createdBy: currentUser?.id ?? selectedContent.authorId,
      })
      setGeneratedDrafts(nextDrafts)
      setFeedback(`Prepared ${nextDrafts.length} platform templates for ${currentWorkspace?.name ?? 'this workspace'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate draft templates.')
      setFeedback('')
    } finally {
      setLoading(false)
    }
  }

  const persistDraft = async (draft: SocialDraft) =>
    await saveDraft({
      ...(draft.id.startsWith('generated-') ? {} : { id: draft.id }),
      workspaceId: draft.workspaceId,
      contentId: draft.contentId,
      platform: draft.platform,
      tone: draft.tone,
      length: draft.length,
      draftText: draft.draftText,
      status: draft.status,
      createdBy: draft.createdBy,
    })

  const runDraftAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action()
      setFeedback(successMessage)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the draft.')
      setFeedback('')
    }
  }

  return (
    <div>
      <PageHeader title="Template Draft Studio" description="Prepare and save deterministic platform templates. Reviewed AI generation is added in PR2." />

      {(feedback || error) && (
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {error || feedback}
        </div>
      )}

      {contents.length === 0 && (
        <EmptyState
          title="No content ready for draft work"
          description="Create content in this workspace first, then come back to generate platform drafts."
          action={
            <Link href="/app/content/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700">
              Create content
            </Link>
          }
          icon="✍️"
        />
      )}

      {contents.length > 0 && (
        <div className="mb-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Source Content</label>
            <select value={contentId} onChange={(event) => setContentId(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              {contents.map((content) => (
                <option key={content.id} value={content.id}>{content.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Tone</label>
            <select value={tone} onChange={(event) => setTone(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              {TONES.map((option) => (
                <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Length</label>
            <select value={length} onChange={(event) => setLength(event.target.value as 'short' | 'medium' | 'long')} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                onClick={() => togglePlatform(platform)}
                className={`rounded-full px-3.5 py-2 text-xs font-medium capitalize transition ${selectedPlatforms.includes(platform) ? 'bg-violet-600 text-white' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'}`}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleGenerate} disabled={loading || selectedPlatforms.length === 0 || !selectedContent} className="mt-5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Generating…' : 'Generate Templates'}
        </button>
        </div>
      )}

      {generatedDrafts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Template drafts</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {generatedDrafts.map((draft) => (
              <DraftEditorCard
                key={draft.id}
                draft={draft}
                  onEdit={(id, text) => {
                    setGeneratedDrafts((prev) =>
                      prev.map((entry) =>
                        entry.id === id ? { ...entry, draftText: text, updatedAt: new Date().toISOString() } : entry,
                      ),
                    )
                    const target = generatedDrafts.find((entry) => entry.id === id)
                    if (target) {
                      void runDraftAction(
                        () => persistDraft({ ...target, draftText: text }),
                        `Saved ${target.platform} draft changes to this workspace.`,
                      )
                    }
                  }}
                  onApprove={(id) => {
                    const target = generatedDrafts.find((entry) => entry.id === id)
                    if (!target) return
                    void runDraftAction(
                      () => persistDraft({ ...target, status: 'approved' }),
                      `Approved ${target.platform} draft.`,
                    )
                    setGeneratedDrafts((prev) => prev.map((entry) => (entry.id === id ? { ...entry, status: 'approved' } : entry)))
                  }}
                  onRegenerate={(id) => {
                    if (!selectedContent) return
                  setGeneratedDrafts((prev) => {
                    return prev.map((entry) =>
                      entry.id === id
                        ? {
                            ...entry,
                            draftText: resetTemplateDraft(entry, selectedContent),
                            updatedAt: new Date().toISOString(),
                          }
                        : entry,
                    )
                    })
                    setFeedback('Reset that draft to its source template.')
                  }}
                />
              ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Saved drafts</h2>
          {selectedContent && <span className="text-sm text-gray-500">{selectedContent.title}</span>}
        </div>
        {existingDrafts.length === 0 ? (
          <EmptyState title="No drafts yet" description="Generate your first set above and save the ones you want to keep." />
        ) : (
          <div className="space-y-6">
            {Object.entries(draftsByPlatform).map(([platform, platformDrafts]) => (
              <section key={platform}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">{platform}</h3>
                  <span className="text-xs text-gray-400">{platformDrafts.length} saved</span>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {platformDrafts.map((draft) => (
                    <DraftEditorCard
                      key={draft.id}
                      draft={draft}
                      onEdit={(id, text) => {
                        const target = existingDrafts.find((entry) => entry.id === id)
                        if (!target) return
                        void runDraftAction(
                          () => persistDraft({ ...target, draftText: text }),
                          `Saved ${target.platform} draft changes to this workspace.`,
                        )
                      }}
                      onApprove={(id) => {
                        void runDraftAction(() => approveDraft(id), 'Draft approved.')
                      }}
                      onRegenerate={(id) => {
                        if (!selectedContent) return
                        const target = existingDrafts.find((entry) => entry.id === id)
                        if (!target) return
                        void runDraftAction(
                          () => persistDraft({ ...target, draftText: resetTemplateDraft(target, selectedContent) }),
                          'Reset and saved the source template.',
                        )
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
