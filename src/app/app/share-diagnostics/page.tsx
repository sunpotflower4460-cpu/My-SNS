'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Image as ImageIcon, RefreshCw, Share2, Smartphone, XCircle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { Button, Card, InlineAlert } from '@/components/ui/kit'
import {
  createWebShareDiagnosticImage,
  describeWebShareFailure,
  detectWebShareDiagnostics,
  type WebShareDiagnostics,
  type WebShareSupportState,
} from '@/lib/services/web-share-diagnostics'

const STATE_LABELS: Record<WebShareSupportState, string> = {
  supported: '対応',
  unsupported: '非対応',
  unknown: '判定不可',
}

const STATE_STYLES: Record<WebShareSupportState, string> = {
  supported: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  unsupported: 'border-rose-200 bg-rose-50 text-rose-700',
  unknown: 'border-amber-200 bg-amber-50 text-amber-700',
}

function stateFromBoolean(value: boolean): WebShareSupportState {
  return value ? 'supported' : 'unsupported'
}

function StatusIcon({ state }: { state: WebShareSupportState }) {
  if (state === 'supported') return <CheckCircle2 aria-hidden className="h-4 w-4 text-emerald-600" />
  if (state === 'unsupported') return <XCircle aria-hidden className="h-4 w-4 text-rose-600" />
  return <AlertTriangle aria-hidden className="h-4 w-4 text-amber-600" />
}

export default function ShareDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<WebShareDiagnostics | null>(null)
  const [testFeedback, setTestFeedback] = useState('')
  const [testError, setTestError] = useState('')
  const [testing, setTesting] = useState<'text' | 'file' | null>(null)

  const refresh = () => {
    setDiagnostics(detectWebShareDiagnostics())
    setTestFeedback('')
    setTestError('')
  }

  useEffect(() => {
    refresh()
  }, [])

  const checks = useMemo(() => diagnostics ? [
    {
      label: 'HTTPS / 安全な接続',
      state: stateFromBoolean(diagnostics.secureContext),
      detail: diagnostics.secureContext ? 'Web Shareを使える安全なコンテキストです。' : 'Web Shareは原則HTTPSでのみ利用できます。',
    },
    {
      label: 'OS共有シート',
      state: stateFromBoolean(diagnostics.shareSupported),
      detail: diagnostics.shareSupported ? 'navigator.share() を利用できます。' : 'このブラウザは navigator.share() を提供していません。',
    },
    {
      label: '共有データ事前判定',
      state: stateFromBoolean(diagnostics.canShareSupported),
      detail: diagnostics.canShareSupported ? 'navigator.canShare() でファイルを事前確認できます。' : 'canShare() がないため、ファイル可否を事前判定できません。',
    },
    {
      label: 'Web Share権限ポリシー',
      state: diagnostics.policyState,
      detail: diagnostics.policyState === 'unsupported'
        ? 'ページ側のPermissions PolicyでWeb Shareが禁止されています。'
        : diagnostics.policyState === 'supported'
          ? 'ブラウザから確認できる範囲ではWeb Shareが許可されています。'
          : 'このブラウザではPermissions Policyの状態を直接確認できません。',
    },
    {
      label: '投稿文の共有',
      state: diagnostics.textShareState,
      detail: diagnostics.textShareState === 'supported'
        ? '投稿文を共有シートへ渡せると判定されています。'
        : diagnostics.textShareState === 'unsupported'
          ? '投稿文共有が拒否されています。コピー＋SNS投稿画面を利用してください。'
          : 'share() はありますが、投稿文の事前判定はできません。実テストで確認できます。',
    },
    {
      label: '診断用PNGファイル共有',
      state: diagnostics.fileShareState,
      detail: diagnostics.fileShareState === 'supported'
        ? '少なくとも診断用PNGをファイル共有候補として受け付けています。実際の画像・動画は投稿時に個別判定します。'
        : diagnostics.fileShareState === 'unsupported'
          ? 'ファイル共有は利用できません。素材の「開く・保存」を使ってください。'
          : 'ファイル共有を事前判定できません。',
    },
    {
      label: 'ユーザー操作状態API',
      state: stateFromBoolean(diagnostics.userActivationSupported),
      detail: diagnostics.userActivationSupported
        ? '共有に必要な一時的なタップ操作の状態を確認できます。'
        : 'ユーザー操作状態を直接確認できないブラウザです。',
    },
  ] : [], [diagnostics])

  const runTextTest = async () => {
    setTestFeedback('')
    setTestError('')
    setTesting('text')
    try {
      if (typeof navigator.share !== 'function') throw new Error('このブラウザでは共有シートを利用できません。')
      await navigator.share({ title: 'My-SNS 共有診断', text: 'My-SNSの共有診断テストです。投稿は行われません。' })
      setTestFeedback('投稿文を共有シートへ渡せました。共有先で投稿しなくても診断は完了です。')
    } catch (cause) {
      const failure = describeWebShareFailure(cause, false)
      if (failure.code === 'abort') setTestFeedback(failure.message)
      else setTestError(failure.message)
    } finally {
      setTesting(null)
      setDiagnostics(detectWebShareDiagnostics())
    }
  }

  const runFileTest = async () => {
    setTestFeedback('')
    setTestError('')
    setTesting('file')
    try {
      if (typeof navigator.share !== 'function') throw new Error('このブラウザでは共有シートを利用できません。')
      const file = createWebShareDiagnosticImage()
      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        throw new TypeError('diagnostic file share is not supported')
      }
      await navigator.share({
        title: 'My-SNS ファイル共有診断',
        text: '診断用の1px PNG画像です。投稿せずキャンセルして構いません。',
        files: [file],
      })
      setTestFeedback('診断用PNGを共有シートへ渡せました。共有先で投稿する必要はありません。')
    } catch (cause) {
      const failure = describeWebShareFailure(cause, true)
      if (failure.code === 'abort') setTestFeedback(failure.message)
      else setTestError(failure.message)
    } finally {
      setTesting(null)
      setDiagnostics(detectWebShareDiagnostics())
    }
  }

  const recommendation = diagnostics?.recommendation

  return (
    <div>
      <PageHeader
        title="スマホ共有診断"
        description="この端末・ブラウザで、My-SNSから投稿文や画像・動画をOS共有シートへ渡せるかを確認します。"
        actions={<Link href="/app/settings" className="text-sm font-medium text-violet-700 hover:text-violet-800">接続と設定へ戻る →</Link>}
      />

      <div className="max-w-4xl space-y-6">
        {diagnostics && recommendation === 'file-share' && (
          <InlineAlert tone="success" title="ファイル共有の高速ルートを利用できる可能性が高いです">
            この端末ではWeb Shareと診断用PNGの共有判定が通っています。投稿パックでは実際の画像・動画を canShare() で再確認してから共有します。
          </InlineAlert>
        )}
        {diagnostics && recommendation === 'text-share' && (
          <InlineAlert tone="info" title="投稿文共有を優先してください">
            OS共有シートは使えますが、ファイル共有は未対応または判定できません。投稿文共有＋素材の「開く・保存」を確実な代替ルートとして使えます。
          </InlineAlert>
        )}
        {diagnostics && recommendation === 'fallback' && (
          <InlineAlert tone="error" title="従来の投稿導線を利用してください">
            この環境ではWeb Shareの安全な利用条件を満たしていません。My-SNSの文章コピー・素材の「開く・保存」・SNS投稿画面を使えば投稿できます。
          </InlineAlert>
        )}

        <Card size="container" padded>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Smartphone aria-hidden className="h-5 w-5 text-violet-600" />
                <h2 className="text-base font-semibold text-gray-900">この端末の診断結果</h2>
              </div>
              <p className="mt-1 text-sm text-gray-500">ブラウザ機能を端末内で確認します。診断情報を外部へ送信しません。</p>
            </div>
            <Button size="sm" variant="secondary" onClick={refresh}>
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              再診断
            </Button>
          </div>

          {!diagnostics ? (
            <p className="mt-5 text-sm text-gray-500">診断中…</p>
          ) : (
            <div className="mt-5 divide-y divide-stone-100 rounded-2xl border border-stone-200">
              {checks.map((check) => (
                <div key={check.label} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <StatusIcon state={check.state} />
                      {check.label}
                    </div>
                    <p className="mt-1 pl-6 text-xs leading-5 text-gray-500">{check.detail}</p>
                  </div>
                  <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STATE_STYLES[check.state]}`}>
                    {STATE_LABELS[check.state]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="container" padded>
          <div className="flex items-center gap-2">
            <Share2 aria-hidden className="h-5 w-5 text-violet-600" />
            <h2 className="text-base font-semibold text-gray-900">共有シートを実際に開いて確認</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            下のテストは共有シートを開くだけです。SNSへの投稿ボタンは押しません。共有先アプリを選ばずキャンセルしても構いません。
          </p>
          {testFeedback && <div className="mt-4"><InlineAlert tone="info">{testFeedback}</InlineAlert></div>}
          {testError && <div className="mt-4"><InlineAlert tone="error">{testError}</InlineAlert></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void runTextTest()} disabled={testing !== null || diagnostics?.shareSupported === false}>
              <Share2 aria-hidden className="h-4 w-4" />
              {testing === 'text' ? '投稿文テスト中…' : '投稿文の共有をテスト'}
            </Button>
            <Button variant="secondary" onClick={() => void runFileTest()} disabled={testing !== null || diagnostics?.shareSupported === false}>
              <ImageIcon aria-hidden className="h-4 w-4" />
              {testing === 'file' ? '画像テスト中…' : '診断用画像の共有をテスト'}
            </Button>
          </div>
        </Card>

        <Card size="container" padded>
          <h2 className="text-base font-semibold text-gray-900">結果の読み方</h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
            <p>「診断用PNGファイル共有」が対応でも、Instagram・TikTok・Xなど各アプリが投稿文や複数ファイルをどう受け取るかはOS・アプリ側の実装によって変わります。</p>
            <p>そのためMy-SNSは、実際の投稿素材を共有する直前にも <code className="rounded bg-stone-100 px-1 text-xs">navigator.canShare({'{ files }'})</code> を確認し、拒否された場合は素材を勝手に省略せず「開く・保存」へ戻します。</p>
            <p>共有シートを開くにはタップなどの一時的なユーザー操作が必要です。素材準備中にその有効時間が切れた場合は、もう一度タップして共有シートを開く設計です。</p>
          </div>
          {diagnostics && (
            <details className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">技術情報を表示</summary>
              <dl className="mt-3 space-y-2 text-xs text-gray-500">
                <div><dt className="font-medium text-gray-700">画面状態</dt><dd>{diagnostics.visibilityState}</dd></div>
                <div><dt className="font-medium text-gray-700">User Agent</dt><dd className="break-all">{diagnostics.userAgent}</dd></div>
              </dl>
            </details>
          )}
        </Card>
      </div>
    </div>
  )
}
