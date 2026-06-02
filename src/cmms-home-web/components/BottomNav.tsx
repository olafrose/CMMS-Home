'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const tabs = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/assets', label: 'Assets', icon: '🔧' },
  { href: '/scan', label: 'Scan', icon: '📷' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render theme-dependent UI after mount
  useEffect(() => setMounted(true), [])

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
