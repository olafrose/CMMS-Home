'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import ApiTokenManager, { type ApiTokenClient } from '@/components/ApiTokenManager'
import type { AuthSession } from '@/lib/types'
import { card, errorMessage, formatDate } from '@/app/settings/access/shared'

/**
 * The signed-in user's own account: who they are, what roles they hold, and where they are
 * signed in. Needs only a session — everything here is about the caller, and the API's
 * /auth/sessions endpoints are scoped to the caller's own sessions.
 *
 * Username, display name and roles are read-only here on purpose: they are what an admin
 * assigns in Settings → Access, and letting a user edit their own roles would be the grid
 * enforcing nothing.
 */

/** Module-level so the manager gets the same object every render. */
const personalTokens: ApiTokenClient = {
  list: api.auth.tokens.list,
  grantable: api.auth.tokens.grantable,
  create: api.auth.tokens.create,
  revoke: api.auth.tokens.revoke,
}

/** "Chrome on Android" from a user-agent string — enough to recognise a device, no more. */
function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device'
  // Order matters: Edge and Samsung Internet also claim Chrome, and Chrome claims Safari.
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /SamsungBrowser\//.test(ua) ? 'Samsung Internet' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' :
    /curl\//.test(ua) ? 'curl' : 'Browser'
  const os =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : null
  return os ? `${browser} on ${os}` : browser
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 text-right min-w-0 truncate">{children}</span>
    </div>
  )
}

export default function AccountPage() {
  const { me, loading, authenticated, can } = useAuth()
  const [sessions, setSessions] = useState<AuthSession[] | null>(null)
  const [sessionsError, setSessionsError] = useState('')
  const [revoking, setRevoking] = useState<string | 'others' | null>(null)
  // Someone who has lost tokens.personal can't mint any more, but must still see and revoke
  // what they minted before — so the section also shows whenever they hold any.
  const [hasTokens, setHasTokens] = useState(false)

  useEffect(() => {
    if (!authenticated) return
    api.auth.sessions()
      .then(setSessions)
      .catch(e => setSessionsError(errorMessage(e, 'Could not load your devices.')))
    api.auth.tokens.list()
      .then(t => setHasTokens(t.length > 0))
      .catch(() => { /* the section's own load reports errors */ })
  }, [authenticated])

  async function revoke(ids: string[], key: string) {
    setRevoking(key)
    setSessionsError('')
    try {
      // A session that expired or was already signed out in the meantime answers 404; that
      // is the outcome we wanted, so it counts as done rather than failing the batch.
      await Promise.all(ids.map(id => api.auth.revokeSession(id).catch(e => {
        if (e?.status !== 404) throw e
      })))
      setSessions(prev => prev?.filter(s => !ids.includes(s.id)) ?? prev)
    } catch (e) {
      setSessionsError(errorMessage(e, 'Could not sign that device out.'))
    } finally {
      setRevoking(null)
    }
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>

  // proxy.ts bounces a missing cookie to /login, but a cookie for a session the server has
  // since dropped still gets here.
  if (!authenticated || !me?.user) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-4 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/login?next=%2Faccount" className="text-blue-600 dark:text-blue-400">Sign in</Link>
        {' '}to see your account.
      </div>
    )
  }

  const user = me.user
  const others = sessions?.filter(s => !s.current) ?? []

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">
          {user.displayName || user.username}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your account</p>
      </div>

      <section className="space-y-2">
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-700`}>
          <DetailRow label="Username">{user.username}</DetailRow>
          <DetailRow label="Display name">
            {user.displayName ?? <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>}
          </DetailRow>
          <DetailRow label="Roles">
            {user.roles.length > 0
              ? user.roles.map(r => r.name).join(', ')
              : <span className="text-slate-400 dark:text-slate-500 font-normal">None</span>}
          </DetailRow>
          <DetailRow label="Member since">{formatDate(user.createdAt)}</DetailRow>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
          Your name and roles are managed by an administrator in Settings → Access.
        </p>
      </section>

      <Link href="/account/password" className={`flex items-center gap-3 ${card} px-4 py-3`}>
        <span className="text-lg leading-none" aria-hidden="true">🔑</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Change password</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Signs out your other devices and revokes your API tokens</p>
        </div>
        <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
      </Link>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1">
          Signed-in devices
        </h2>

        {sessionsError && <p className="text-xs text-red-500 px-1">{sessionsError}</p>}

        {sessions === null && !sessionsError && (
          <p className="text-sm text-slate-400 dark:text-slate-500 px-1">Loading…</p>
        )}

        {sessions && (
          <div className={`${card} divide-y divide-slate-100 dark:divide-slate-700`}>
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {describeDevice(s.userAgent)}
                    {s.current && (
                      <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">This device</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Active {timeAgo(s.lastSeenAt)} · signed in {formatDate(s.createdAt)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={() => revoke([s.id], s.id)}
                    disabled={revoking !== null}
                    className="text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
                  >
                    {revoking === s.id ? 'Signing out…' : 'Sign out'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {others.length > 1 && (
          <button
            onClick={() => revoke(others.map(s => s.id), 'others')}
            disabled={revoking !== null}
            className="w-full text-sm font-medium text-red-600 dark:text-red-400 py-2 disabled:opacity-50"
          >
            {revoking === 'others' ? 'Signing out…' : `Sign out all ${others.length} other devices`}
          </button>
        )}
      </section>

      {(can('tokens.personal') || hasTokens) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1">
            API tokens
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
            For your own scripts. A token acts as you, limited to the permissions you tick, and never
            more than your roles allow at the time it is used. Personal tokens always expire.
          </p>
          <div className={`${card} px-4 py-3`}>
            <ApiTokenManager client={personalTokens} personal canCreate={can('tokens.personal')} />
          </div>
        </section>
      )}
    </div>
  )
}
