'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import PasswordInput from '@/components/PasswordInput'
import { card, errorMessage, fieldErrors } from '@/app/settings/access/shared'

/**
 * Self-service password change. Needs only a session, not a permission — every account may
 * change its own password, and the API checks the current one before accepting a new one.
 *
 * A success signs out every *other* session of this account (the API does that), so the
 * page says so: someone changing a password because it leaked should know the old sessions
 * are gone, and someone who didn't expect it should know why their phone wants a sign-in.
 */
export default function ChangePasswordPage() {
  const { loading, authenticated } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [mismatch, setMismatch] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next !== confirm) { setMismatch(true); return }
    setMismatch(false)
    setSaving(true)
    try {
      await api.auth.changePassword(current, next)
      setCurrent(''); setNext(''); setConfirm('')
      setDone(true)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>

  // proxy.ts bounces a missing cookie to /login, but a cookie for a session the server has
  // since dropped still gets here.
  if (!authenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-4 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/login?next=%2Faccount%2Fpassword" className="text-blue-600 dark:text-blue-400">Sign in</Link>
        {' '}to change your password.
      </div>
    )
  }

  const currentErrors = fieldErrors(error, 'currentPassword')
  const newErrors = fieldErrors(error, 'password')
  // Anything the server said that isn't about one of the two fields.
  const otherError = error && currentErrors.length === 0 && newErrors.length === 0
    ? errorMessage(error, 'Could not change the password. Try again.')
    : ''

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div>
        <Link href="/account" className="text-blue-500 text-sm">‹ Account</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-2">Change password</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your other signed-in devices will be signed out. This one stays signed in.
        </p>
      </div>

      <form onSubmit={handleSubmit} className={`${card} px-4 py-4 space-y-4`}>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current password</label>
          <PasswordInput
            value={current} onChange={e => setCurrent(e.target.value)}
            autoComplete="current-password" autoFocus
            className="field"
          />
          {currentErrors.map(m => <p key={m} className="text-xs text-red-500 mt-1">{m}</p>)}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New password</label>
          <PasswordInput
            value={next} onChange={e => setNext(e.target.value)}
            autoComplete="new-password"
            className="field"
          />
          {newErrors.map(m => <p key={m} className="text-xs text-red-500 mt-1">{m}</p>)}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm new password</label>
          <PasswordInput
            value={confirm} onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="field"
          />
          {mismatch && <p className="text-xs text-red-500 mt-1">The two passwords do not match.</p>}
        </div>

        {otherError && <p className="text-xs text-red-500">{otherError}</p>}
        {done && (
          <p role="status" className="text-xs text-green-600 dark:text-green-400">
            Password changed. Your other devices have been signed out.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !current || !next || !confirm}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
