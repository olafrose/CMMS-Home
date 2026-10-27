'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import PasswordInput from '@/components/PasswordInput'
import { api, ApiError } from '@/lib/api'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

export default function SetupPage() {
  const router = useRouter()
  const { loading, setupRequired } = useAuth()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // First run only. Wait for /auth/me before deciding — `setupRequired` is false while it
  // is still in flight, and bouncing on that would send the operator to a login form for
  // an account that does not exist yet.
  useEffect(() => {
    if (!loading && !setupRequired) router.replace('/login')
  }, [loading, setupRequired, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setSubmitting(true)
    setError('')
    try {
      await api.auth.setup({
        username: username.trim(),
        password,
        displayName: displayName.trim() || undefined,
      })
      // Setup signs the new administrator in. A full page load rather than refresh() +
      // router.push, for the reason given on AuthProvider's `login` — and refreshing here
      // would also clear `setupRequired`, firing the effect above into /login mid-exit.
      window.location.replace('/')
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 means somebody got here first — there is an account now, so sign in.
        if (err.status === 409) { router.replace('/login'); return }
        setError(err.errors?.password?.[0] ?? err.errors?.username?.[0] ?? err.message)
      } else {
        setError('Could not reach the server. Try again.')
      }
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 pt-10 pb-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">First run</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          This creates the first administrator account — full access, including who else may
          sign in and what they may do. It can only be done once.
        </p>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Display name (optional)
          </label>
          <input
            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="Shown instead of the username"
            className="field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
          <PasswordInput
            value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            className="field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm password</label>
          <PasswordInput
            value={confirm} onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="field"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !username.trim() || !password || !confirm}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create administrator'}
        </button>
      </form>
    </div>
  )
}
