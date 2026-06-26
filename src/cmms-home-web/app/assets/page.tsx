'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Asset } from '@/lib/types'

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

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [activeLocation, setActiveLocation] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    api.assets.list()
      .then(setAssets)
      .finally(() => setLoading(false))
  }, [])

  const locations = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of assets) {
      if (a.locationId && a.location) seen.set(a.locationId, a.location.name)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [assets])

  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of assets) {
      if (a.categoryId && a.category) seen.set(a.categoryId, a.category.name)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [assets])

  const filtered = assets.filter(a =>
    (!activeLocation || a.locationId === activeLocation) &&
    (!activeCategory || a.categoryId === activeCategory)
  )

  const categoryName = categories.find(([id]) => id === activeCategory)?.[1]
  const locationName = locations.find(([id]) => id === activeLocation)?.[1]
  const activeCount = (activeCategory ? 1 : 0) + (activeLocation ? 1 : 0)
  const hasFilterOptions = locations.length > 0 || categories.length > 0

  function clearAll() {
    setActiveCategory(null)
    setActiveLocation(null)
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Assets</h1>
        <Link
          href="/assets/new"
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

            {activeCategory && categoryName && (
              <ActiveChip label={categoryName} onClear={() => setActiveCategory(null)} />
            )}
            {activeLocation && locationName && (
              <ActiveChip label={locationName} onClear={() => setActiveLocation(null)} />
            )}
            {activeCount > 0 && (
              <button onClick={clearAll} className="text-sm text-slate-500 dark:text-slate-400 underline">
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
              {categories.length > 0 && (
                <FilterGroup label="Category" entries={categories} active={activeCategory} onSelect={setActiveCategory} />
              )}
              {locations.length > 0 && (
                <FilterGroup label="Location" entries={locations} active={activeLocation} onSelect={setActiveLocation} />
              )}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

      {!loading && assets.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🔧</p>
          <p className="font-medium">No assets yet</p>
          <p className="text-sm mt-1">
            <Link href="/assets/new" className="text-blue-500 underline">Add your first asset</Link>
          </p>
        </div>
      )}

      {!loading && assets.length > 0 && filtered.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm py-8 text-center">
          No assets match the active filters.
        </p>
      )}

      <ul className="space-y-3">
        {filtered.map((asset) => (
          <li key={asset.id}>
            <Link
              href={`/assets/${asset.id}`}
              className="flex items-center gap-4 bg-white dark:bg-slate-800 rounded-xl px-4 py-4 shadow-sm border border-slate-100 dark:border-slate-700"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{asset.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                  {[asset.category?.name, asset.location?.name].filter(Boolean).join(' · ') || 'No details'}
                </p>
              </div>
              <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
