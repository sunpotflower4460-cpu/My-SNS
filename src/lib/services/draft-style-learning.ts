import type { AiDraftSnapshot, DraftRevision, PublishingChannel } from '@/lib/domain/types'
import type { DraftStyleExample, DraftStyleSnapshot } from '@/lib/services/interfaces'

export const STYLE_LEARNING_LIMIT_PER_CHANNEL = 3
export const STYLE_EXAMPLE_FIELD_CHAR_LIMIT = 400

export type StyleField = 'title' | 'body' | 'hashtags' | 'cta'

export interface StyleFieldDiff {
  field: StyleField
  before: string
  after: string
}

function trimToUndefined(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function sortedHashtags(hashtags: string[]): string {
  return [...hashtags].sort().join(',')
}

function formatHashtags(hashtags: string[]): string {
  if (hashtags.length === 0) return '(none)'
  return hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
}

function capField(value: string, limit = STYLE_EXAMPLE_FIELD_CHAR_LIMIT): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function capSnapshot(snapshot: DraftStyleSnapshot): DraftStyleSnapshot {
  return {
    title: snapshot.title ? capField(snapshot.title) : undefined,
    body: capField(snapshot.body),
    hashtags: snapshot.hashtags,
    cta: snapshot.cta ? capField(snapshot.cta) : undefined,
  }
}

/** Normalize an AI proposal (or an approved Revision) into the frozen snapshot shape. */
export function freezeAiOriginalSnapshot(input: {
  title?: string | null
  body: string
  hashtags?: string[] | null
  cta?: string | null
}): AiDraftSnapshot {
  return {
    title: trimToUndefined(input.title),
    body: input.body,
    hashtags: input.hashtags ?? [],
    cta: trimToUndefined(input.cta),
  }
}

/**
 * What to freeze on an AI draft's first INSERT. Prefers the generation-time
 * snapshot when the client still has it, so a pre-save edit does not get
 * baked into "AI original". Falls back to the content being saved — the
 * previous honest limit — only when no generation-time copy was passed.
 */
export function snapshotForFirstAiSave(draft: {
  source: DraftRevision['source'] | 'template' | 'ai'
  aiOriginalSnapshot?: AiDraftSnapshot
  title?: string | null
  draftText: string
  hashtags?: string[] | null
  cta?: string | null
}): AiDraftSnapshot | null {
  if (draft.source !== 'ai') return null
  if (draft.aiOriginalSnapshot) return freezeAiOriginalSnapshot(draft.aiOriginalSnapshot)
  return freezeAiOriginalSnapshot({
    title: draft.title,
    body: draft.draftText,
    hashtags: draft.hashtags,
    cta: draft.cta,
  })
}

export function snapshotFromRevision(revision: Pick<DraftRevision, 'title' | 'body' | 'hashtags' | 'cta'>): AiDraftSnapshot {
  return freezeAiOriginalSnapshot({
    title: revision.title,
    body: revision.body,
    hashtags: revision.hashtags,
    cta: revision.cta,
  })
}

export function diffSnapshots(aiProposed: AiDraftSnapshot, humanApproved: AiDraftSnapshot): StyleFieldDiff[] {
  const diffs: StyleFieldDiff[] = []

  if ((trimToUndefined(aiProposed.title) ?? '') !== (trimToUndefined(humanApproved.title) ?? '')) {
    diffs.push({
      field: 'title',
      before: trimToUndefined(aiProposed.title) ?? '',
      after: trimToUndefined(humanApproved.title) ?? '',
    })
  }
  if (aiProposed.body !== humanApproved.body) {
    diffs.push({ field: 'body', before: aiProposed.body, after: humanApproved.body })
  }
  if (sortedHashtags(aiProposed.hashtags ?? []) !== sortedHashtags(humanApproved.hashtags ?? [])) {
    diffs.push({
      field: 'hashtags',
      before: formatHashtags(aiProposed.hashtags ?? []),
      after: formatHashtags(humanApproved.hashtags ?? []),
    })
  }
  if ((trimToUndefined(aiProposed.cta) ?? '') !== (trimToUndefined(humanApproved.cta) ?? '')) {
    diffs.push({
      field: 'cta',
      before: trimToUndefined(aiProposed.cta) ?? '',
      after: trimToUndefined(humanApproved.cta) ?? '',
    })
  }

  return diffs
}

/** True when the approved content actually differs from what the AI originally proposed. */
export function wasRevisionEditedByHuman(revision: DraftRevision): boolean {
  if (!revision.aiOriginalSnapshot) return false
  return diffSnapshots(revision.aiOriginalSnapshot, snapshotFromRevision(revision)).length > 0
}

/**
 * Newest-first AI revisions a human actually edited, capped per channel.
 * Unedited approvals are omitted: they do not teach a correction.
 */
export function buildDraftStyleExamples(
  revisions: DraftRevision[],
  limitPerChannel = STYLE_LEARNING_LIMIT_PER_CHANNEL,
): DraftStyleExample[] {
  const examples: DraftStyleExample[] = []
  const countPerChannel = new Map<PublishingChannel, number>()

  for (const revision of revisions) {
    if (revision.source !== 'ai' || !revision.aiOriginalSnapshot) continue
    if (!wasRevisionEditedByHuman(revision)) continue

    const soFar = countPerChannel.get(revision.channel) ?? 0
    if (soFar >= limitPerChannel) continue

    examples.push({
      channel: revision.channel,
      aiProposed: capSnapshot(revision.aiOriginalSnapshot),
      humanApproved: capSnapshot(snapshotFromRevision(revision)),
    })
    countPerChannel.set(revision.channel, soFar + 1)
  }

  return examples
}

function quote(value: string): string {
  const display = value.trim() ? value : '(none)'
  return `"${display.replace(/\s+/g, ' ')}"`
}

export function formatDraftStyleExamplesForPrompt(examples: DraftStyleExample[]): string {
  if (examples.length === 0) return ''

  return [
    'Past edits this creator made to AI proposals (learn the pattern, do not copy the content verbatim):',
    ...examples.map((example, index) => {
      const diffs = diffSnapshots(example.aiProposed, example.humanApproved)
      const changed = new Set(diffs.map((diff) => diff.field))
      const lines = [`${index + 1}. [${example.channel}]`]

      if (changed.has('body')) {
        lines.push(`   body: ${quote(example.aiProposed.body)} → ${quote(example.humanApproved.body)}`)
      } else {
        lines.push(`   body (kept): ${quote(example.humanApproved.body)}`)
      }
      if (changed.has('title')) {
        lines.push(`   title: ${quote(example.aiProposed.title ?? '')} → ${quote(example.humanApproved.title ?? '')}`)
      }
      if (changed.has('hashtags')) {
        lines.push(`   hashtags: ${formatHashtags(example.aiProposed.hashtags)} → ${formatHashtags(example.humanApproved.hashtags)}`)
      }
      if (changed.has('cta')) {
        lines.push(`   cta: ${quote(example.aiProposed.cta ?? '')} → ${quote(example.humanApproved.cta ?? '')}`)
      }

      return lines.join('\n')
    }),
  ].join('\n')
}

/**
 * Compact, fact-free style notes derived from several corrections on the same
 * channel. A single edit is not a tendency — it stays as a few-shot example
 * instead. Never copies wording from a past Seed into these notes.
 */
export function summarizeStyleTendencies(examples: DraftStyleExample[]): string[] {
  const byChannel = new Map<PublishingChannel, DraftStyleExample[]>()
  for (const example of examples) {
    const bucket = byChannel.get(example.channel) ?? []
    bucket.push(example)
    byChannel.set(example.channel, bucket)
  }

  const notes: string[] = []

  for (const [channel, channelExamples] of byChannel) {
    if (channelExamples.length < 2) continue

    const shortened = channelExamples.filter((example) => example.humanApproved.body.length < example.aiProposed.body.length * 0.8).length
    const lengthened = channelExamples.filter((example) => example.humanApproved.body.length > example.aiProposed.body.length * 1.2).length
    if (shortened >= Math.ceil(channelExamples.length / 2) && shortened > lengthened) {
      notes.push(`${channel}: tends to shorten the body`)
    } else if (lengthened >= Math.ceil(channelExamples.length / 2) && lengthened > shortened) {
      notes.push(`${channel}: tends to lengthen the body`)
    }

    const fewerTags = channelExamples.filter((example) => example.humanApproved.hashtags.length < example.aiProposed.hashtags.length).length
    const moreTags = channelExamples.filter((example) => example.humanApproved.hashtags.length > example.aiProposed.hashtags.length).length
    if (fewerTags >= Math.ceil(channelExamples.length / 2) && fewerTags > moreTags) {
      notes.push(`${channel}: tends to use fewer hashtags`)
    } else if (moreTags >= Math.ceil(channelExamples.length / 2) && moreTags > fewerTags) {
      notes.push(`${channel}: tends to use more hashtags`)
    }

    const droppedTitle = channelExamples.filter(
      (example) => Boolean(trimToUndefined(example.aiProposed.title)) && !trimToUndefined(example.humanApproved.title),
    ).length
    if (droppedTitle >= Math.ceil(channelExamples.length / 2)) {
      notes.push(`${channel}: tends to drop the title`)
    }

    const rewroteCta = channelExamples.filter(
      (example) => (trimToUndefined(example.aiProposed.cta) ?? '') !== (trimToUndefined(example.humanApproved.cta) ?? ''),
    ).length
    if (rewroteCta >= Math.ceil(channelExamples.length / 2)) {
      notes.push(`${channel}: often rewrites the CTA (keep the Seed's CTA facts, match the approved voice)`)
    }
  }

  return notes
}

export const STYLE_FIELD_LABELS_JA: Record<StyleField, string> = {
  title: 'タイトル',
  body: '本文',
  hashtags: 'ハッシュタグ',
  cta: 'CTA',
}

export interface StyleCorrectionRow {
  revisionId: string
  seedId: string
  channel: PublishingChannel
  createdAt: string
  diffs: StyleFieldDiff[]
}

/** Newest-first approved corrections, for the Analytics "what we remembered" list. */
export function selectRecentStyleCorrections(revisions: DraftRevision[], limit = 8): StyleCorrectionRow[] {
  return revisions
    .filter((revision) => revision.source === 'ai' && wasRevisionEditedByHuman(revision))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit)
    .map((revision) => ({
      revisionId: revision.id,
      seedId: revision.seedId,
      channel: revision.channel,
      createdAt: revision.createdAt,
      diffs: diffSnapshots(revision.aiOriginalSnapshot as AiDraftSnapshot, snapshotFromRevision(revision)),
    }))
}

export function truncateStylePreview(value: string, limit = 80): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return '（空）'
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized
}
