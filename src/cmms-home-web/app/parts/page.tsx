'use client'

import { useEffect, useMemo, useState } from 'react'
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
        {(part.partCategory || part.asset) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {part.partCategory && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {part.partCategory.name}
              </span>
            )}
            {part.asset && <span className="text-xs text-slate-400 dark:text-slate-500 truncate">for {part.asset.name}</span>}
          </div>
        )}
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

function FilterGroup({ label, entries, active, onSelect }: {
  label: string
  entries: [string, string][]
  active: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-1.5 w-20 shrink-0">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {entries.map(([id, name]) => (
          <button
            key={id}
            onClick={() => onSelect(active === id ? null : id)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              active === id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
      {label}
      <button
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 leading-none"
      >
        ×
      </button>
    </span>
  )
}

export default function PartsPage() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [activeAsset, setActiveAsset] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    api.parts.list().then(setParts).finally(() => setLoading(false))
  }, [])

  const assetOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of parts) if (p.assetId && p.asset) seen.set(p.assetId, p.asset.name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [parts])

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of parts) if (p.partCategoryId && p.partCategory) seen.set(p.partCategoryId, p.partCategory.name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [parts])

  const filtered = parts.filter(p =>
    (!activeAsset || p.assetId === activeAsset) &&
    (!activeCategory || p.partCategoryId === activeCategory)
  )

  const lowStock = filtered.filter(p => p.minQuantity != null && p.quantity <= p.minQuantity)
  const normal = filtered.filter(p => p.minQuantity == null || p.quantity > p.minQuantity)

  const assetName = assetOptions.find(([id]) => id === activeAsset)?.[1]
  const categoryName = categoryOptions.find(([id]) => id === activeCategory)?.[1]
  const activeCount = (activeAsset ? 1 : 0) + (activeCategory ? 1 : 0)
  const hasFilterOptions = assetOptions.length > 0 || categoryOptions.length > 0

  function clearAll() {
    setActiveAsset(null)
    setActiveCategory(null)
  }

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

      {hasFilterOptions && (
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(v => !v)}
              aria-expanded={showFilters}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                showFilters || activeCount > 0
                  ? 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              } bg-white dark:bg-slate-800`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
              {activeCount > 0 && (
                <span className="ml-0.5 min-w-5 h-5 px-1 flex items-center justify-center text-xs font-semibold rounded-full bg-blue-600 text-white">
                  {activeCount}
                </span>
              )}
            </button>

            {activeAsset && assetName && <ActiveChip label={assetName} onClear={() => setActiveAsset(null)} />}
            {activeCategory && categoryName && <ActiveChip label={categoryName} onClear={() => setActiveCategory(null)} />}
            {activeCount > 0 && (
              <button onClick={clearAll} className="text-sm text-slate-500 dark:text-slate-400 underline">
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
              {categoryOptions.length > 0 && (
                <FilterGroup label="Category" entries={categoryOptions} active={activeCategory} onSelect={setActiveCategory} />
              )}
              {assetOptions.length > 0 && (
                <FilterGroup label="Asset" entries={assetOptions} active={activeAsset} onSelect={setActiveAsset} />
              )}
            </div>
          )}
        </div>
      )}

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

      {!loading && parts.length > 0 && filtered.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm py-8 text-center">
          No parts match the active filters.
        </p>
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
