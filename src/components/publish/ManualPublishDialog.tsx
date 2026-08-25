'use client'

import { useEffect, useState } from 'react'
import { Button, Dialog, FormField, InlineAlert } from '@/components/ui/kit'

interface ManualPublishDialogProps {
  open: boolean
  loading?: boolean
  targetLabel?: string
  error?: string
  onClose: () => void
  onConfirm: (externalUrl?: string) => Promise<void> | void
}

export default function ManualPublishDialog({
  open,
  loading = false,
  targetLabel,
  error,
  onClose,
  onConfirm,
}: ManualPublishDialogProps) {
  const [externalUrl, setExternalUrl] = useState('')

  useEffect(() => {
    if (open) setExternalUrl('')
  }, [open])

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (loading) return
        onClose()
      }}
      title="投稿済みとして記録"
      description="実際に公開を確認できた内容だけを記録します。URLが分かる場合は一緒に残せます。"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            キャンセル
          </Button>
          <Button loading={loading} variant="primary" onClick={() => void onConfirm(externalUrl.trim() || undefined)}>
            投稿済みにする
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {targetLabel && (
          <p className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3.5 py-3 text-sm text-[color:var(--text-default)]">
            対象: <span className="font-medium text-[color:var(--text-strong)]">{targetLabel}</span>
          </p>
        )}

        {error && <InlineAlert tone="error">{error}</InlineAlert>}

        <FormField
          label="公開URL（任意）"
          description="投稿先で確認できたURLがある時だけ貼り付けてください。分からない場合は空欄のままで完了できます。"
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://..."
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              className="min-h-touch w-full rounded-card border border-[color:var(--border-default)] bg-white px-4 py-2.5 text-sm text-[color:var(--text-default)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition focus:border-[color:var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--focus-ring)]"
            />
          )}
        </FormField>
      </div>
    </Dialog>
  )
}
