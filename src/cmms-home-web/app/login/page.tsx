'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import PasswordInput from '@/components/PasswordInput'
import { ApiError } from '@/lib/api'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

/**
 * Where to land after signing in. Read from window rather than useSearchParams to avoid a
 * Suspense boundary, matching /labels. Only same-site paths are honoured — a `next` of
 * `//evil.example` or `https://…` would otherwise turn this form into an open redirect.
 */
function safeNext(): string {
  if (typeof window === 'undefined') return '/'
  const next = new URLSearchParams(window.location.search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

export default function LoginPage() {
  const router = useRouter()
  const { login, authenticated, setupRequired } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // With no accounts at all there is nothing to sign in to — the operator belongs at
  // /setup. Also skip the form for someone who already has a session.
  useEffect(() => {
    if (setupRequired) router.replace('/setup')
    else if (authenticated) router.replace(safeNext())
  }, [setupRequired, authenticated, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      // Leaves the page on success, so `submitting` is never reset — the button should keep
      // saying "Signing in…" until the next page replaces this one.
      await login(username.trim(), password, safeNext())
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.setupRequired) { router.replace('/setup'); return }
        // Prefer the server's own wording — it distinguishes bad credentials from a
        // disabled account, and inventing a message here would flatten that.
        setError(err.errors?.password?.[0] ?? err.errors?.username?.[0] ?? err.message)
      } else {
        setError('Could not reach the server. Try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-10 pb-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Sign in</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">CMMS@home</p>
      </div>

      <form onSubmit={handleSubmit} className={`${card} px-4 py-4 space-y-4`}>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            autoComplete="username" autoCapitalize="none" autoFocus
            className="field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
          <PasswordInput
            value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            className="field"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Scanning a printed label lets you log maintenance on that one item without signing in.
      </p>
    </div>
  )
}
