'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import { Badge, Button, Card, Dialog, FormField, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import type { ShadowGrowthStrategy } from '@/lib/shadow-strategy/types'
import {
  accountLabel,
  canManageShadowStrategy,
  canViewShadowStrategy,
  clientImportPayloadError,
  defaultSelectedSocialAccountId,
  DIMENSION_LABELS_JA,
  formatLift,
  formatPercent,
  presentShadowStrategy,
  selectShadowSocialAccounts,
} from '@/lib/presentation/shadow-strategy-presenter'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; latest: ShadowGrowthStrategy | null }
  | { status: 'error'; message: string }

export default function ShadowStrategySection() {
  const { currentWorkspace, currentMember, socialAccounts } = useApp()
  const canView = canViewShadowStrategy(currentMember?.role)
  const canManage = canManageShadowStrategy(currentMember?.role)
  const accounts = useMemo(() => selectShadowSocialAccounts(socialAccounts), [socialAccounts])
  const [selectedSocialAccountId, setSelectedSocialAccountId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' })
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const selectedId = selectedSocialAccountId ?? defaultSelectedSocialAccountId(accounts)
  const selectedAccount = accounts.find((account) => account.id === selectedId) ?? null
  const latest = loadState.status === 'loaded' ? loadState.latest : null
  const view = presentShadowStrategy(latest)

  const loadStrategy = useCallback(async (workspaceId: string, socialAccountId: string) => {
    setLoadState({ status: 'loading' })
    try {
      const response = await fetch(
        `/api/internal/shadow-strategy?workspaceId=${encodeURIComponent(workspaceId)}&socialAccountId=${encodeURIComponent(socialAccountId)}`,
      )
      const body = (await response.json().catch(() => null)) as { latest?: ShadowGrowthStrategy | null; error?: string } | null
      if (!response.ok) {
        setLoadState({ status: 'error', message: body?.error ?? 'Shadow Strategy を読み込めませんでした。' })
        return
      }
      setLoadState({ status: 'loaded', latest: body?.latest ?? null })
    } catch {
      setLoadState({ status: 'error', message: 'Shadow Strategy を読み込めませんでした。' })
    }
  }, [])

  useEffect(() => {
    if (!canView || !currentWorkspace?.id || !selectedId) {
      setLoadState({ status: 'idle' })
      return
    }
    void loadStrategy(currentWorkspace.id, selectedId)
  }, [canView, currentWorkspace?.id, loadStrategy, selectedId])

  if (!canView) return null

  const handleImport = async () => {
    const syntaxError = clientImportPayloadError(importText)
    if (syntaxError) {
      setImportError(syntaxError)
      return
    }
    if (!currentWorkspace?.id || !selectedId) {
      setImportError('SNSアカウントを選択してください。')
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      const payload = JSON.parse(importText) as unknown
      const response = await fetch('/api/internal/shadow-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          socialAccountId: selectedId,
          payload,
        }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string; strategy?: ShadowGrowthStrategy } | null
      if (!response.ok) {
        setImportError(body?.error ?? '取り込みに失敗しました。')
        return
      }
      setImportText('')
      setImportOpen(false)
      setLoadState({ status: 'loaded', latest: body?.strategy ?? null })
    } catch {
      setImportError('取り込みに失敗しました。')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="mt-6">
      <Card size="container" padded>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">Growth Strategy</h2>
              <Badge tone="warning">SHADOW</Badge>
            </div>
            <p className="mt-2 text-sm text-amber-800">{view.warning}</p>
          </div>
          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => { setImportOpen(true); setImportError(null) }}>
              Shadow Strategyを読み込む
            </Button>
          )}
        </div>

        {accounts.length === 0 ? (
          <EmptyState title="まだSNSアカウントがありません" description="ワークスペースにSNSアカウントがあると、ここに分析表示専用の戦略を保存できます。" />
        ) : (
          <>
            {accounts.length > 1 && (
              <label className="mb-4 block text-sm text-gray-700">
                SNSアカウント
                <select
                  className="mt-1 w-full rounded-card border border-stone-200 bg-white px-3 py-2 text-sm"
                  value={selectedId ?? ''}
                  onChange={(event) => setSelectedSocialAccountId(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountLabel(account)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {loadState.status === 'loading' && <p className="text-sm text-gray-500">読み込み中です…</p>}
            {loadState.status === 'error' && <InlineAlert tone="error">{loadState.message}</InlineAlert>}
            {loadState.status === 'loaded' && view.empty && (
              <EmptyState
                title="まだ Shadow Strategy がありません"
                description="Owner / Admin が Bridge の Explicit Link と Strategy を手動で読み込むと、ここに表示されます。生成や公開には使いません。"
              />
            )}
            {loadState.status === 'loaded' && latest && selectedAccount && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ChannelBadge channel={latest.platform} />
                  <span className="text-sm text-gray-700">{selectedAccount.handle}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(latest.generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800">{view.statusCopy}</p>
                <dl className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-400">対象期間</dt>
                    <dd>
                      {new Date(latest.sourceWindow.from).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                      {' 〜 '}
                      {new Date(latest.sourceWindow.to).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">サンプル数</dt>
                    <dd>{latest.sampleSize}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">総合スコア</dt>
                    <dd>{latest.overallScore}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">確信度</dt>
                    <dd>{formatPercent(latest.confidence)}</dd>
                  </div>
                </dl>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">{view.preferredTitle}</h3>
                  {view.preferred.length === 0 ? (
                    <p className="text-sm text-gray-500">表示できる傾向はまだありません。</p>
                  ) : (
                    <ul className="space-y-2">
                      {view.preferred.map((pattern) => (
                        <li key={`preferred-${pattern.dimension}-${pattern.value}`} className="rounded-card border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-gray-700">
                          <span className="font-medium">{DIMENSION_LABELS_JA[pattern.dimension]}</span>
                          <span className="mx-2 text-gray-500">{pattern.value}</span>
                          <span className="text-xs text-gray-500">
                            lift {formatLift(pattern.lift)} · n={pattern.sampleSize} · 確信度 {formatPercent(pattern.confidence)}
                          </span>
                          {pattern.rationale && (
                            <details className="mt-1 text-xs text-gray-500">
                              <summary>詳細</summary>
                              <p className="mt-1">{pattern.rationale}</p>
                            </details>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">{view.avoidTitle}</h3>
                  {view.avoid.length === 0 ? (
                    <p className="text-sm text-gray-500">表示できる傾向はまだありません。</p>
                  ) : (
                    <ul className="space-y-2">
                      {view.avoid.map((pattern) => (
                        <li key={`avoid-${pattern.dimension}-${pattern.value}`} className="rounded-card border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-gray-700">
                          <span className="font-medium">{DIMENSION_LABELS_JA[pattern.dimension]}</span>
                          <span className="mx-2 text-gray-500">{pattern.value}</span>
                          <span className="text-xs text-gray-500">
                            lift {formatLift(pattern.lift)} · n={pattern.sampleSize} · 確信度 {formatPercent(pattern.confidence)}
                          </span>
                          {pattern.rationale && (
                            <details className="mt-1 text-xs text-gray-500">
                              <summary>詳細</summary>
                              <p className="mt-1">{pattern.rationale}</p>
                            </details>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog
        open={importOpen}
        onClose={() => { if (!importing) { setImportOpen(false); setImportText(''); setImportError(null) } }}
        title="Shadow Strategyを読み込む"
        description="Bridge が出力した { link, strategy } の JSON を貼り付けます。いま選んでいる SNSアカウントへ保存され、分析画面にだけ表示されます。"
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportText(''); setImportError(null) }} disabled={importing}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={() => void handleImport()} loading={importing}>
              読み込む
            </Button>
          </>
        )}
      >
        <FormField label="Import JSON" error={importError ?? undefined} required>
          {(field) => (
            <textarea
              {...field}
              value={importText}
              onChange={(event) => { setImportText(event.target.value); setImportError(null) }}
              rows={12}
              className="w-full rounded-card border border-stone-200 bg-white px-3 py-2 font-mono text-xs leading-5"
              placeholder={'{\n  "link": {},\n  "strategy": {}\n}'}
            />
          )}
        </FormField>
      </Dialog>
    </div>
  )
}
