'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function LoginPage() {
  const router = useRouter()
  const { currentUser, isAuthenticated, isReady, signInAs, users } = useCurrentUser()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/app/dashboard')
    }
  }, [isAuthenticated, isReady, router])

  const userSummaries = useMemo(
    () =>
      users.map((user) => ({
        ...user,
      })),
    [users],
  )

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-gray-500">Loading…</div>
  }

  const handleEmailSignIn = (event: React.FormEvent) => {
    event.preventDefault()
    const matchedUser = users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase())

    if (!matchedUser) {
      setError('Use one of the seeded emails below to enter the prototype.')
      return
    }

    setError('')
    signInAs(matchedUser.id)
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
              Sign in with a seeded mock account, switch between workspaces, and keep your local prototype state across refreshes.
            </p>
          </div>

          <form onSubmit={handleEmailSignIn} className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              Quick sign-in by seeded email
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@creatorhub.io"
                className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <button
                type="submit"
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700"
              >
                Enter workspace
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </form>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {userSummaries.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  signInAs(user.id)
                }}
                className="rounded-3xl border border-stone-200 bg-white p-5 text-left shadow-sm shadow-stone-100 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
                    Seeded mock user
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm shadow-stone-200/70 sm:p-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Mock auth flow</h2>
          <div className="mt-5 space-y-5 text-sm leading-6 text-gray-600">
            <p>• <strong className="text-gray-900">/app</strong> is now protected by a lightweight local session guard.</p>
            <p>• Your selected user is stored in localStorage so refreshes keep you in context.</p>
            <p>• Workspace switching is also persisted, so each mock account can move between memberships naturally.</p>
            <p>• This structure is intentionally simple so it can be swapped for Supabase Auth later.</p>
          </div>
          {currentUser && (
            <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
              Signed in as {currentUser.name}. Redirecting to your workspace…
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
