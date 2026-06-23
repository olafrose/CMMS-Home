'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Part } from '@/lib/types'

function storageBreadcrumb(part: Part): string {
  if (part.box) {
    const shelf = part.box.shelf
    if (shelf) return `${part.box.name} › ${shelf.name} › ${shelf.location.name}`
    if (part.box.location) return `${part.box.name} › ${part.box.location.name}`
    return part.box.name
  }
  if (part.shelf) return `${part.shelf.name} › ${part.shelf.location.name}`
  if (part.location) return part.location.name
  return 'No location'
}

function PartRow({ part }: { part: Part }) {
  const lowStock = part.minQuantity != null && part.quantity <= part.minQuantity
  return (
    <Link
      href={`/parts/${part.id}`}
      className="flex items-center gap-4 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 shadow-sm border border-slate-100 dark:border-slate-700"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{part.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{storageBreadcrumb(part)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`font-semibold text-sm ${lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
          {part.quantity} {part.unit}
        </p>
        {lowStock && <p className="text-xs text-amber-500">Low stock</p>}
      </div>
      <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
    </Link>
  )
}

export default function PartsPage() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.parts.list().then(setParts).finally(() => setLoading(false))
  }, [])

  const lowStock = parts.filter(p => p.minQuantity != null && p.quantity <= p.minQuantity)
  const normal = parts.filter(p => p.minQuantity == null || p.quantity > p.minQuantity)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Parts</h1>
        <Link
          href="/parts/new"
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow"
        >
          + New
        </Link>
      </div>

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

      {!loading && parts.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🔩</p>
          <p className="font-medium">No parts yet</p>
          <p className="text-sm mt-1">
            <Link href="/parts/new" className="text-blue-500 underline">Add your first part</Link>
          </p>
        </div>
      )}

      {lowStock.length > 0 && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">Low Stock</h2>
          <ul className="space-y-2">
            {lowStock.map(p => <li key={p.id}><PartRow part={p} /></li>)}
          </ul>
        </section>
      )}

      {normal.length > 0 && (
        <ul className="space-y-2">
          {normal.map(p => <li key={p.id}><PartRow part={p} /></li>)}
        </ul>
      )}
    </div>
  )
}
