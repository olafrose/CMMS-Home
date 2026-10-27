'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Me } from '@/lib/types'

interface AuthState {
  /** Null until the first /auth/me resolves, and after a failed refresh. */
  me: Me | null
  /** True while the first /auth/me is in flight. See the note on `can` below. */
  loading: boolean
  authenticated: boolean
  /** No accounts exist yet — the operator belongs at /setup. */
  setupRequired: boolean
  /**
   * Whether the current user holds a permission, for hiding and disabling controls.
   *
   * This is a courtesy, never a security boundary: the API enforces independently, so a
   * page that gets this wrong is a UI bug, not a hole. Returns false while `loading`, so
   * branch on `loading` first and show a skeleton — treating it as a denial would flash
   * "you may not" at everyone on every page load.
   */
  can: (permission: string) => boolean
  refresh: () => Promise<void>
  /** Signs in, then does a full page load of `next` (see the note in the provider). */
  login: (username: string, password: string, next: string) => Promise<void>
  /** Signs out, then does a full page load of /login. */
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Loads the signed-in user once and shares it.
 *
 * Deliberately renders its children immediately rather than gating on the fetch. The QR
 * quick-log flow is built around the form painting from local defaults and being usable in
 * one tap; blocking the whole tree on an auth round-trip would put a network request in
 * front of every scan, which is exactly the budget this app is designed around.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setMe(await api.auth.me())
    } catch {
      // /auth/me answers "nobody" rather than failing, so a throw here means the API is
      // unreachable. Leave `me` null: pages fall back to showing nothing privileged, which
      // is the right posture when we cannot tell who this is.
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Signing in, out, or through first-run setup ends in a full page load, never router.push.
  // The router caches prefetched routes, and the BottomNav links on /login are prefetched
  // while signed out — so proxy.ts answers them with a redirect to /login, and that cached
  // redirect is what a client-side push to `/` would replay. Sign-in used to "hang" on
  // "Signing in…" exactly that way, until the cache entry went stale. A full load also
  // re-reads /auth/me from scratch, so no state from the previous identity survives.
  //
  // `me` is deliberately not set before leaving: flipping `authenticated` would fire the
  // login page's own redirect effect into the same cached redirect, racing this navigation.
  const login = useCallback(async (username: string, password: string, next: string) => {
    await api.auth.login(username, password)
    window.location.replace(next)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch (e) {
      // A session the server has already forgotten still needs to log out locally.
      if (!(e instanceof ApiError)) throw e
    }

    // The service worker caches same-origin /api GETs, so a signed-out browser could
    // otherwise be served the previous user's data from disk while offline. Clearing here is
    // what makes "sign out" mean it on a device that keeps working without a network.
    if (typeof caches !== 'undefined') {
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.includes('apis'))
          .map((k) => caches.delete(k)),
      ).catch(() => {})
    }

    // A full load for the reason given on `login`.
    window.location.replace('/login')
  }, [])

  const value = useMemo<AuthState>(() => {
    const granted = new Set(me?.permissions ?? [])
    return {
      me,
      loading,
      authenticated: me?.authenticated === true,
      setupRequired: me?.setupRequired === true,
      can: (permission: string) => granted.has(permission),
      refresh,
      login,
      logout,
    }
  }, [me, loading, refresh, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
