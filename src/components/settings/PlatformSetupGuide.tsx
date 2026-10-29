'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { PLATFORM_SETUP_GUIDES, buildPlatformRedirectUri } from '@/lib/services/connectors/platform-setup'
import type { ConnectablePlatform } from '@/lib/services/connectors/platforms'

// The "how do I get this platform connectable" panel shown under a row whose
// developer app isn't configured yet. It states exactly what is missing and
// what to register, instead of letting the Connect button dead-end.

export interface PlatformSetupGuideProps {
  platform: ConnectablePlatform
  missingEnv: string[]
  /** The public origin the app is served from; used to build the redirect URI. */
  baseUrl: string
}

export default function PlatformSetupGuide({ platform, missingEnv, baseUrl }: PlatformSetupGuideProps) {
  const guide = PLATFORM_SETUP_GUIDES[platform]
  const redirectUri = buildPlatformRedirectUri(baseUrl, platform)
  const [copied, setCopied] = useState(false)

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable (insecure context); the URI stays selectable text.
    }
  }

  return (
    <details className="rounded-card border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-gray-700">
      <summary className="cursor-pointer text-sm font-medium text-amber-800">
        接続するには設定が必要です（手順を見る）
      </summary>
      <div className="mt-3 space-y-3">
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">登録する Redirect URI</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-white px-2 py-1.5 text-xs text-gray-800">{redirectUri}</code>
            <button
              type="button"
              onClick={() => void copyRedirectUri()}
              className="inline-flex min-h-control shrink-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-stone-50"
            >
              {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
              {copied ? 'コピーしました' : 'コピー'}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">.env.local に設定する項目（未設定のものは強調）</p>
          <ul className="flex flex-wrap gap-2">
            {guide.envVars.map((name) => {
              const missing = missingEnv.includes(name)
              return (
                <li
                  key={name}
                  className={`rounded px-2 py-1 font-mono text-xs ${missing ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}
                >
                  {name}
                  {missing ? '（未設定）' : '（設定済み）'}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-gray-500">設定後は開発サーバーを再起動してください。</p>
        </div>

        {guide.caveat && <p className="rounded bg-white px-3 py-2 text-xs leading-5 text-gray-600">注意: {guide.caveat}</p>}

        <a
          href={guide.consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          {guide.consoleLabel}を開く
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </div>
    </details>
  )
}
