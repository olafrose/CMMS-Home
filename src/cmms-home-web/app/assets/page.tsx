'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Asset } from '@/lib/types'

function FilterRow({ entries, active, onSelect }: {
  entries: [string, string][]
  active: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
          active === null
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        }`}
      >
        All
      </button>
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
  )
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
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

      {(locations.length > 0 || categories.length > 0) && (
        <div className="space-y-2 mb-4">
          {categories.length > 0 && (
            <FilterRow entries={categories} active={activeCategory} onSelect={setActiveCategory} />
          )}
          {locations.length > 0 && (
            <FilterRow entries={locations} active={activeLocation} onSelect={setActiveLocation} />
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
