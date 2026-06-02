'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/assets', label: 'Assets', icon: '🔧' },
  { href: '/scan', label: 'Scan', icon: '📷' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex safe-pb">
      {tabs.map((tab) => {
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors ${
              active ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
