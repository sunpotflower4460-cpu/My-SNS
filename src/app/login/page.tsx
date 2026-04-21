'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-provider'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const { user, isAuthenticated, isReady } = useAuth()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/app/dashboard')
    }
  }, [isAuthenticated, isReady, router])

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-gray-500">Loading…</div>
  }

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Please enter your email address')
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/app/dashboard`,
        },
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess('Check your email for the magic link!')
        setEmail('')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
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
              C
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">Creator Hub</h1>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              Sign in with your email to access your workspace. We&apos;ll send you a magic link to sign in securely.
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
              Email address
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
                disabled={isLoading}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send magic link'}
              </button>
            </div>
          </form>
        </section>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm shadow-stone-200/70 sm:p-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Supabase Auth</h2>
          <div className="mt-5 space-y-5 text-sm leading-6 text-gray-600">
            <p>• <strong className="text-gray-900">Magic link</strong> authentication for secure, passwordless sign-in.</p>
            <p>• Your session is managed by Supabase Auth with automatic refresh.</p>
            <p>• <strong className="text-gray-900">/app</strong> routes are protected and require authentication.</p>
            <p>• All data is now backed by a real Supabase database.</p>
          </div>
          {user && (
            <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
              Signed in as {user.name}. Redirecting to your workspace...
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
