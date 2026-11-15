'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button, InlineAlert } from '@/components/ui/kit'
import { readJsonBody } from '@/lib/api/read-json'
import { isMuseCallback, MUSE_AUTHORIZE_APPROVAL_PATH } from '@/lib/muse/oauth-params'

export function MuseApprovalForm({
  authorizationPath,
  allowCapture,
  cancelUrl,
  workspaces,
}: {
  authorizationPath: string
  allowCapture: boolean
  cancelUrl: string
  workspaces: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState(workspaces.length === 1 ? workspaces[0].id : '')
  const [canCapture, setCanCapture] = useState(allowCapture)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspaceId || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(MUSE_AUTHORIZE_APPROVAL_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorization: authorizationPath.slice(authorizationPath.indexOf('?') + 1),
          workspaceId,
          canCapture,
        }),
      })
      if (response.status === 401) {
        router.replace(`/login?${new URLSearchParams({ next: authorizationPath })}`)
        return
      }

      const result = await readJsonBody(response)
      if (!response.ok) throw new Error(result.error ?? '接続を承認できませんでした。')
      const destination = new URL(result.redirectTo)
      if (!isMuseCallback(destination.origin + destination.pathname)) throw new Error('Muse への接続先を確認できませんでした。')
      window.location.assign(destination.href)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '接続を承認できませんでした。')
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={approve}>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <div>
        <p className="text-sm font-medium text-gray-700">ワークスペース</p>
        {workspaces.length === 1 ? (
          <p className="mt-1 break-words text-base font-semibold text-gray-900">{workspaces[0].name}</p>
        ) : (
          <select
            aria-label="ワークスペース"
            className="mt-1 min-h-touch w-full rounded-lg border border-stone-300 bg-white px-3 text-base"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            required
            disabled={submitting}
          >
            <option value="">選択してください</option>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm text-gray-700">
        <p className="font-medium text-gray-900">Muse に許可する操作</p>
        <p>下書きや投稿などの要対応件数を確認</p>
        {allowCapture && (
          <label className="flex min-h-touch items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-violet-600" checked={canCapture} onChange={(event) => setCanCapture(event.target.checked)} disabled={submitting} />
            メモやリンクを発信素材として保存
          </label>
        )}
      </div>
      <p className="text-xs leading-5 text-gray-600">このワークスペースに以前の Muse 接続がある場合は、新しい接続に切り替わります。</p>
      <Button className="w-full" variant="primary" type="submit" disabled={submitting || !workspaceId}>
        {submitting ? '接続しています…' : '承認して Muse に戻る'}
      </Button>
      <a href={cancelUrl} className="flex min-h-touch items-center justify-center text-sm font-medium text-gray-600">キャンセル</a>
    </form>
  )
}
