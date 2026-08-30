'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-provider'
import {
  LOGIN_OTP_ALREADY_SENT_MESSAGE,
  LOGIN_OTP_SENT_MESSAGE,
  getOtpCooldownUntil,
  isOtpCooldownActive,
  mapLoginAuthError,
  markOtpSent,
  normalizeLoginEmail,
} from '@/lib/auth/login-otp'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const { user, isAuthenticated, isReady } = useAuth()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/app/dashboard')
    }
  }, [isAuthenticated, isReady, router])

  useEffect(() => {
    const storedUntil = getOtpCooldownUntil(email) ?? 0
    setCooldownUntil((current) => (current === storedUntil ? current : storedUntil))
  }, [email])

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const timer = window.setTimeout(() => setCooldownUntil(0), cooldownUntil - Date.now())
    return () => window.clearTimeout(timer)
  }, [cooldownUntil])

  const isCoolingDown = cooldownUntil > Date.now()
  const isSubmitDisabled = isLoading || isCoolingDown

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-gray-500">読み込み中…</div>
  }

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = normalizeLoginEmail(email)
    if (!normalizedEmail) {
      setError('メールアドレスを入力してください')
      setSuccess('')
      return
    }

    if (isOtpCooldownActive(normalizedEmail) || isCoolingDown) {
      setError('')
      setSuccess(LOGIN_OTP_ALREADY_SENT_MESSAGE)
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/app/dashboard`,
        },
      })

      if (authError) {
        setError(mapLoginAuthError(authError))
      } else {
        setSuccess(LOGIN_OTP_SENT_MESSAGE)
        setCooldownUntil(markOtpSent(normalizedEmail))
      }
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
              メールアドレスを入力するだけで、あなたの発信ワークスペースにログインできます。パスワードは不要です。ご入力のメールアドレス宛てに安全なマジックリンクをお送りしますので、届いたリンクをクリックしてください。
            </p>
          </div>

          <form onSubmit={handleSignIn} className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
            {success && (
              <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {success}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
                className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isLoading ? '送信中...' : 'マジックリンクを送る'}
              </button>
            </div>
          </form>
        </section>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm shadow-stone-200/70 sm:p-10">
          <h2 className="text-sm font-semibold tracking-[0.05em] text-gray-400">Supabaseによる認証</h2>
          <div className="mt-5 space-y-5 text-sm leading-6 text-gray-600">
            <p>• <strong className="text-gray-900">マジックリンク</strong>認証により、パスワードなしで安全にログインできます。</p>
            <p>• ログイン状態はSupabase Authが管理し、自動的に更新されます。</p>
            <p>• <strong className="text-gray-900">/app</strong> 配下のページは保護されており、ログインが必要です。</p>
            <p>• すべてのデータは実際のSupabaseデータベースに保存されています。</p>
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
