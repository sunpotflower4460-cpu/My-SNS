'use client'

import Link from 'next/link'
import { ArrowDownToLine, ArrowUpRight, Clipboard, KeyRound, ListChecks, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { buttonClassName } from '@/components/ui/kit/Button'
import { readJsonBody } from '@/lib/api/read-json'
import { useApp } from '@/lib/app/app-provider'
import { MUSE_META_HELP, MUSE_SITE, MUSE_SPEC_PATH } from '@/lib/muse/links'
import { hasPermission } from '@/lib/permissions'

type Credential = { expiresAt: string; canCapture: boolean }
const DATE_FORMAT = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' })
const CHECK_PROMPT = 'My-SNS の要対応を確認して。確認する下書き、期限を迎えた投稿、投稿エラー、返信が必要な件数をまとめて、対応画面へのリンクを付けて。'
const CAPTURE_PROMPT = 'このメモの事実を変えずに、My-SNS に発信素材として保存して。公開はせず、保存した素材を開くリンクを返して。'

function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [status, setStatus] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('コピーしました')
    } catch {
      const control = input.current ?? textarea.current
      control?.focus()
      control?.select()
      setStatus('選択した文字を端末のメニューからコピーしてください。')
    }
  }

  const fieldClass = 'ui-input min-w-0 w-full rounded-control px-3 py-2.5 text-base leading-relaxed sm:text-sm'

  return (
    <div className="min-w-0 space-y-2">
      {secret ? (
        <input ref={input} readOnly value={value} aria-label={label} autoComplete="off" spellCheck={false} className={fieldClass} />
      ) : (
        <textarea ref={textarea} readOnly value={value} aria-label={label} rows={3} className={fieldClass} />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button onClick={() => void copy()}><Clipboard aria-hidden className="h-4 w-4" />{label}をコピー</Button>
        <span role="status" className="text-xs leading-5 text-gray-600">{status}</span>
      </div>
    </div>
  )
}

export default function MusePage() {
  const { currentWorkspace, currentMember, defaultBrandProfile } = useApp()
  const canManage = Boolean(currentMember && hasPermission(currentMember.role, 'edit_settings'))
  const workspaceId = currentWorkspace?.id
  const endpoint = canManage && workspaceId ? `/api/muse/connection?workspaceId=${encodeURIComponent(workspaceId)}` : ''
  const [origin, setOrigin] = useState('')
  const [credential, setCredential] = useState<Credential | null>(null)
  const [canCapture, setCanCapture] = useState(true)
  const [key, setKey] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [busy, setBusy] = useState<'POST' | 'DELETE' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => setOrigin(window.location.origin), [])

  useEffect(() => {
    if (!endpoint) return
    const controller = new AbortController()
    const load = async () => {
      setLoaded(false)
      setError('')
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
        const data = await readJsonBody(response)
        if (!response.ok || !('credential' in data)) throw new Error(data.error ?? 'キーの状態を読み込めませんでした。')
        if (controller.signal.aborted) return
        setCredential(data.credential)
        setCanCapture(data.credential?.canCapture ?? true)
        setLoaded(true)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'キーの状態を読み込めませんでした。')
      }
    }
    void load()
    return () => controller.abort()
  }, [endpoint, loadAttempt])

  const manageKey = async (method: 'POST' | 'DELETE') => {
    if (!endpoint || busy || !loaded) return
    setBusy(method)
    setError('')
    setNotice('')
    try {
      const response = await fetch(endpoint, method === 'POST' ? {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canCapture }),
      } : { method })
      const data = await readJsonBody(response)
      if (!response.ok || !('credential' in data) || (method === 'POST' && typeof data.key !== 'string')) {
        throw new Error(data.error ?? '接続キーの設定を更新できませんでした。')
      }
      setCredential(data.credential)
      setKey(method === 'POST' ? data.key : '')
      if (method === 'DELETE') setNotice('接続キーを無効にしました。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '接続キーの設定を更新できませんでした。')
    } finally {
      setBusy(null)
    }
  }

  const expired = Boolean(credential && Date.parse(credential.expiresAt) <= Date.now())
  const specUrl = origin ? new URL(MUSE_SPEC_PATH, origin).href : ''
  const setupPrompt = specUrl ? `My-SNS を個人用のカスタムコネクターとして設定して。API の仕様は ${specUrl} 。My-SNS の接続キーが必要なので、チャットではなく安全な認証情報の入力欄を案内して。まず状況の確認だけを試して、確認できた件数と My-SNS のリンクを教えて。` : ''

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5">
      <header className="rounded-container border border-violet-200 bg-violet-50 p-4 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-card bg-white text-violet-700"><Sparkles aria-hidden className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-violet-800">Meta のパーソナル AI</p>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Muse 連携</h1>
          </div>
        </div>
        <p className="mt-3 text-sm leading-5 text-gray-700">Muse で要対応を確認し、発信素材を保存できます。投稿は My-SNS で行います。</p>
        <p className="mt-2 break-words text-xs font-medium text-violet-800">対象：{currentWorkspace?.name}</p>
      </header>

      {canManage ? (
        <div className="grid items-start gap-5 md:grid-cols-2">
          <section aria-labelledby="muse-key">
            <Card size="container" padded={false} className="min-w-0 space-y-3 p-4 sm:space-y-4 sm:p-6">
              <h2 id="muse-key" className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <KeyRound aria-hidden className="h-5 w-5 shrink-0 text-violet-600" />1. 接続キーを発行
              </h2>
              {error && <InlineAlert tone="error">{error}</InlineAlert>}
              {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
              {!loaded ? (error ? <Button onClick={() => setLoadAttempt((value) => value + 1)}>再読み込み</Button> : <p role="status" className="text-sm text-gray-600">接続キーを確認中…</p>) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={expired ? 'warning' : credential ? 'success' : 'neutral'}>
                      {expired ? '期限切れ' : credential ? 'キー発行済み' : 'キー未発行'}
                    </Badge>
                    {credential && <span className="text-xs leading-5 text-gray-600">{credential.canCapture ? '確認・素材保存' : '確認のみ'}／{DATE_FORMAT.format(new Date(credential.expiresAt))} まで（日本時間）</span>}
                  </div>
                  {key ? (
                    <div className="space-y-2 rounded-card bg-violet-50 p-3">
                      <p className="text-sm leading-6 text-gray-700">キーの表示はこの画面限りです。Muse の安全な認証情報の入力欄に登録してください。</p>
                      <CopyField label="接続キー" value={key} secret />
                      <Button variant="ghost" onClick={() => setKey('')}>キーを隠す</Button>
                    </div>
                  ) : (
                    <fieldset className="space-y-2" disabled={Boolean(busy)}>
                      <legend className="mb-2 text-sm font-medium text-gray-900">Muse に許可する操作</legend>
                      <label className="flex min-h-touch min-w-0 cursor-pointer items-center gap-3 rounded-control border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-violet-300 has-[:checked]:bg-violet-50">
                        <input type="radio" name="scope" checked={canCapture} onChange={() => setCanCapture(true)} className="h-4 w-4 shrink-0 accent-violet-600" />
                        状況の確認と発信素材の保存
                      </label>
                      <label className="flex min-h-touch min-w-0 cursor-pointer items-center gap-3 rounded-control border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-violet-300 has-[:checked]:bg-violet-50">
                        <input type="radio" name="scope" checked={!canCapture} onChange={() => setCanCapture(false)} className="h-4 w-4 shrink-0 accent-violet-600" />
                        状況の確認のみ
                      </label>
                    </fieldset>
                  )}
                  {!defaultBrandProfile && canCapture && (
                    <p className="text-xs leading-5 text-gray-600">素材の保存には <Link href="/app/brand" className="font-semibold text-violet-700 underline">発信スタイルの設定</Link> が必要です。</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!key && (
                      <Button variant="primary" loading={busy === 'POST'} disabled={Boolean(busy)} onClick={() => void manageKey('POST')} className="w-full sm:w-auto">
                        {credential ? 'キーを再発行' : '接続キーを発行'}
                      </Button>
                    )}
                    {credential && (
                      <Button variant="destructive" loading={busy === 'DELETE'} disabled={Boolean(busy)} onClick={() => void manageKey('DELETE')}>キーを無効にする</Button>
                    )}
                  </div>
                  {credential && !key && <p className="text-xs leading-5 text-gray-600">再発行すると以前のキーは使えなくなります。</p>}
                </>
              )}
            </Card>
          </section>

          <section aria-labelledby="muse-setup">
            <Card size="container" padded={false} className="min-w-0 space-y-4 p-4 sm:p-6">
              <h2 id="muse-setup" className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-violet-600" />2. スマホの Muse で設定
              </h2>
              <p className="text-sm leading-6 text-gray-700">設定用の依頼文を Muse アプリのチャットへ貼り付けます。認証情報の入力欄が表示されたら、My-SNS に戻ってキーをコピーし、その欄に登録してください。</p>
              {origin && !origin.startsWith('https://') && (
                <InlineAlert tone="info">スマホの Muse から接続するときは、公開されている My-SNS の HTTPS URL でこの画面を開いてください。</InlineAlert>
              )}
              {setupPrompt && <CopyField label="設定用の依頼文" value={setupPrompt} />}
              <div className="flex flex-wrap items-center gap-2">
                <a href={MUSE_SITE} target="_blank" rel="noreferrer" className={buttonClassName({})}>Muse を開く <ArrowUpRight aria-hidden className="h-4 w-4" /></a>
                <a href={MUSE_META_HELP} target="_blank" rel="noreferrer" className={buttonClassName({ variant: 'ghost' })}>Meta の設定ガイド <ArrowUpRight aria-hidden className="h-4 w-4" /></a>
              </div>
            </Card>
          </section>
        </div>
      ) : (
        <InlineAlert tone="info">接続キーを発行できるのはこのワークスペースのオーナーと管理者です。</InlineAlert>
      )}

      <section aria-labelledby="muse-use">
        <Card size="container" padded={false} className="space-y-4 p-4 sm:p-6">
          <h2 id="muse-use" className="flex items-center gap-2 text-base font-semibold text-gray-900"><ListChecks aria-hidden className="h-5 w-5 text-violet-600" />Muse に頼めること</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyField label="状況確認の例文" value={CHECK_PROMPT} />
            <CopyField label="素材保存の例文" value={CAPTURE_PROMPT} />
          </div>
          {credential && !credential.canCapture && !expired && (
            <p className="text-sm leading-6 text-gray-600">今のキーは確認のみです。Muse から保存するには「状況の確認と発信素材の保存」を選んで再発行します。</p>
          )}
          <p className="text-sm leading-6 text-gray-600">写真や動画を付けるときは、Muse が返した素材のリンクを開き、My-SNS で追加します。接続せず、Muse の文章をコピーして新しい発信に貼り付けることもできます。</p>
          {currentMember && hasPermission(currentMember.role, 'create_seeds') && (
            <Link href="/app/seeds/new#seed-source" className={buttonClassName({})}><ArrowDownToLine aria-hidden className="h-4 w-4" />文章を貼り付けて発信を作る</Link>
          )}
        </Card>
      </section>
    </div>
  )
}
