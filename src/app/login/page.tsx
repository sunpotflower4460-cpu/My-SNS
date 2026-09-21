'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-provider'
import { mapLoginAuthError, normalizeLoginEmail } from '@/lib/auth/login-otp'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

type AuthMode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const { user, isAuthenticated, isReady } = useAuth()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/app/dashboard')
    }
  }, [isAuthenticated, isReady, router])

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-gray-500">読み込み中…</div>
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = normalizeLoginEmail(email)
    if (!normalizedEmail) {
      setError('メールアドレスを入力してください')
      return
    }
    if (!password) {
      setError('パスワードを入力してください')
      return
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const result =
        mode === 'signup'
          ? await supabase.auth.signUp({ email: normalizedEmail, password })
          : await supabase.auth.signInWithPassword({ email: normalizedEmail, password })

      if (result.error) {
        setError(mapLoginAuthError(result.error))
        return
      }

      if (mode === 'signup' && !result.data.session) {
        // Local Supabase usually returns a session immediately (email confirm off).
        // Hosted projects with confirm-required will land here.
        setError('アカウントは作成されました。メール確認が必要な設定の場合は、確認後にログインしてください。')
        setMode('signin')
        return
      }

      router.replace('/app/dashboard')
    } catch (err) {
      setError('予期しないエラーが発生しました。もう一度お試しください。')
      console.error('Sign in error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm shadow-stone-200/70 sm:p-10">
          <div className="mb-8 max-w-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-xl font-bold text-white shadow-sm shadow-violet-200">
              M
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">My-SNS</h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              メールアドレスとパスワードでログインします。メール送信やマジックリンク待ちはありません。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              autoComplete="email"
              className="mb-4 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50"
            />
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6文字以上"
              disabled={isLoading}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="mb-4 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {isLoading ? '処理中...' : mode === 'signup' ? 'アカウントを作って入る' : 'ログイン'}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setMode((current) => (current === 'signin' ? 'signup' : 'signin'))
                setError('')
              }}
              className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {mode === 'signup' ? 'すでにアカウントがある方はログイン' : '初めての方はアカウント作成'}
            </button>
          </form>
        </section>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm shadow-stone-200/70 sm:p-10">
          <h2 className="text-sm font-semibold tracking-[0.05em] text-gray-400">ローカル向けログイン</h2>
          <div className="mt-5 space-y-5 text-sm leading-6 text-gray-600">
            <p>
              • <strong className="text-gray-900">パスワード</strong>
              で即ログインできます。メールの送信上限や1時間待ちはありません。
            </p>
            <p>• ローカル開発では Docker 上の Supabase を使い、Vercel へのデプロイは不要です。</p>
            <p>
              • <strong className="text-gray-900">/app</strong> 配下はログイン後だけ開けます。
            </p>
          </div>
          {user && (
            <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
              {user.name} としてログイン中です。ワークスペースへ移動しています...
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
