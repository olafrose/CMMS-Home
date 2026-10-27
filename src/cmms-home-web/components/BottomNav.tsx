'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'

const tabs = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/assets', label: 'Assets', icon: '🔧' },
  { href: '/parts', label: 'Parts', icon: '🔩' },
  { href: '/scan', label: 'Scan', icon: '📷' },
]

// Content views plus Settings, which owns the configuration pages (categories live
// under /settings/categories now).
const manageLinks = [
  { href: '/tools', label: 'Tools', icon: '🛠️' },
  { href: '/storage', label: 'Storage', icon: '🗄️' },
  { href: '/documents', label: 'Documents', icon: '📄' },
  { href: '/labels', label: 'Labels', icon: '🖨️' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

// Three states, not two. A light/dark flip-flop can never return to "follow the device",
// so the default — and the only setting that tracks the phone's own night mode — becomes
// unreachable the first time anyone touches it.
const THEME_CHOICES = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'Auto', icon: '📱' },
]

/**
 * Theme picker, inside the account menu rather than the tab bar.
 *
 * Deliberately NOT a server-side setting: it belongs with the label print preferences in
 * localStorage, because it is a property of *this device*. "Auto" follows the phone's own
 * night mode, which a shared server value could only fight, and someone who scanned a label
 * has no account for a server-side preference to hang off.
 */
function AppearancePicker() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Appearance</p>
      <div className="flex gap-1">
        {THEME_CHOICES.map(choice => {
          // The stored choice isn't known until after hydration, so nothing is marked
          // active rather than guessing and visibly correcting itself a moment later.
          const active = mounted && theme === choice.value
          return (
            <button
              key={choice.value}
              onClick={() => setTheme(choice.value)}
              aria-pressed={active}
              className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">{choice.icon}</span>
              {choice.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function BottomNav() {
  const pathname = usePathname()
  const { me, loading: authLoading, authenticated, can, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [unclassifiedCount, setUnclassifiedCount] = useState(0)

  useEffect(() => { setMenuOpen(false); setAccountOpen(false) }, [pathname])

  // Refresh the unclassified badge on navigation and whenever the documents page
  // signals a change (classify/ignore/rescan), so the count doesn't go stale.
  // Skipped without documents.read: the nav mounts on the scanned-label log page too, and
  // that request would be a guaranteed refusal on the one path with a time budget.
  useEffect(() => {
    if (!can('documents.read')) return
    const refresh = () => api.documents.list({ status: 'Unclassified' })
      .then(docs => setUnclassifiedCount(docs.length))
      .catch(() => {})
    refresh()
    window.addEventListener('documents:changed', refresh)
    return () => window.removeEventListener('documents:changed', refresh)
  }, [pathname, can])

  const manageActive = manageLinks.some(l => pathname.startsWith(l.href))

  return (
    // z-30: above anything a page positions (sticky grid columns, dropdowns, Save bars use
    // z-10/z-20 and would otherwise paint over the bar as they scroll under it), below the
    // full-screen document preview (z-50).
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex items-center safe-pb">
      {tabs.map((tab) => {
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors ${
              active ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        )
      })}

      {/* More menu */}
      <div className="relative">
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full right-0 mb-2 mr-1 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden min-w-36">
              {manageLinks.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span>{l.icon}</span>
                  <span className="flex-1">{l.label}</span>
                  {l.href === '/documents' && unclassifiedCount > 0 && (
                    <span className="ml-1 bg-amber-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                      {unclassifiedCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className={`relative flex flex-col items-center gap-0.5 px-4 py-3 text-xs font-medium transition-colors ${
            menuOpen || manageActive ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'
          }`}
          aria-label="More"
        >
          <span className="text-xl leading-none">⋯</span>
          More
          {unclassifiedCount > 0 && (
            <span className="absolute top-1.5 right-1.5 bg-amber-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {unclassifiedCount > 9 ? '9+' : unclassifiedCount}
            </span>
          )}
        </button>
      </div>

      {/* Account. Signed out gets the same popover rather than a bare link: it is where the
          sign-in link lives, and it keeps the appearance picker reachable for someone who
          scanned a label and has no account at all.

          Rendered only once /auth/me has answered, so a signed-in user never sees
          "Sign in" flash past on every page load. */}
      {!authLoading && (
        <div className="relative">
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAccountOpen(false)} />
              <div className="absolute bottom-full right-0 mb-2 mr-1 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden w-56">
                <div className="px-4 pt-3 pb-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {authenticated ? 'Signed in as' : 'Not signed in'}
                  </p>
                  {authenticated && (
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {me?.user?.displayName || me?.user?.username}
                    </p>
                  )}
                </div>

                <AppearancePicker />

                {authenticated && (
                  <Link
                    href="/account"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span aria-hidden="true">👤</span>
                    <span className="flex-1 text-left">My account</span>
                  </Link>
                )}

                {authenticated ? (
                  <button
                    onClick={() => logout()}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span aria-hidden="true">🚪</span>
                    <span className="flex-1 text-left">Sign out</span>
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span aria-hidden="true">🔑</span>
                    <span className="flex-1 text-left">Sign in</span>
                  </Link>
                )}
              </div>
            </>
          )}
          <button
            onClick={() => setAccountOpen(v => !v)}
            className={`flex flex-col items-center gap-0.5 px-3 py-3 text-xs font-medium transition-colors ${
              accountOpen ? 'text-blue-500' : 'text-slate-500 dark:text-slate-400'
            }`}
            aria-label="Account"
          >
            <span className="text-xl leading-none">👤</span>
            <span className="max-w-14 truncate">
              {authenticated ? (me?.user?.displayName || me?.user?.username) : 'Account'}
            </span>
          </button>
        </div>
      )}
    </nav>
  )
}
