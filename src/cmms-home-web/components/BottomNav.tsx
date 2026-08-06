'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

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

export default function BottomNav() {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unclassifiedCount, setUnclassifiedCount] = useState(0)

  useEffect(() => setMounted(true), [])
  useEffect(() => setMenuOpen(false), [pathname])

  // Refresh the unclassified badge on navigation and whenever the documents page
  // signals a change (classify/ignore/rescan), so the count doesn't go stale.
  useEffect(() => {
    const refresh = () => api.documents.list({ status: 'Unclassified' })
      .then(docs => setUnclassifiedCount(docs.length))
      .catch(() => {})
    refresh()
    window.addEventListener('documents:changed', refresh)
    return () => window.removeEventListener('documents:changed', refresh)
  }, [pathname])

  const manageActive = manageLinks.some(l => pathname.startsWith(l.href))

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex items-center safe-pb">
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

      <button
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        className="px-4 py-3 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        aria-label="Toggle theme"
      >
        {mounted ? (resolvedTheme === 'dark' ? '☀️' : '🌙') : '🌙'}
      </button>
    </nav>
  )
}
