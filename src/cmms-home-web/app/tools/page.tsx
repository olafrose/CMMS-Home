'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Tool } from '@/lib/types'

function storageBreadcrumb(tool: Tool): string {
  if (tool.box) {
    const shelf = tool.box.shelf
    if (shelf) return `${tool.box.name} › ${shelf.name} › ${shelf.location.name}`
    if (tool.box.location) return `${tool.box.name} › ${tool.box.location.name}`
    return tool.box.name
  }
  if (tool.shelf) return `${tool.shelf.name} › ${tool.shelf.location.name}`
  if (tool.location) return tool.location.name
  return 'No location'
}

function openLoan(tool: Tool) {
  return tool.loans?.find(l => !l.returnedAt)
}

function ToolRow({ tool }: { tool: Tool }) {
  const loan = openLoan(tool)
  return (
    <Link
      href={`/tools/${tool.id}`}
      className="flex items-center gap-4 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 shadow-sm border border-slate-100 dark:border-slate-700"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{tool.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{storageBreadcrumb(tool)}</p>
        {(tool.toolCategory || tool.asset) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {tool.toolCategory && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {tool.toolCategory.name}
              </span>
            )}
            {tool.asset && <span className="text-xs text-slate-400 dark:text-slate-500 truncate">for {tool.asset.name}</span>}
          </div>
        )}
      </div>
      {loan && (
        <span className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          {loan.borrower}
        </span>
      )}
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

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [activeAsset, setActiveAsset] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    api.tools.list().then(setTools).finally(() => setLoading(false))
  }, [])

  const assetOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of tools) if (t.assetId && t.asset) seen.set(t.assetId, t.asset.name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tools])

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of tools) if (t.toolCategoryId && t.toolCategory) seen.set(t.toolCategoryId, t.toolCategory.name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [tools])

  const filtered = tools.filter(t =>
    (!activeAsset || t.assetId === activeAsset) &&
    (!activeCategory || t.toolCategoryId === activeCategory)
  )

  const onLoan = filtered.filter(t => openLoan(t))
  const available = filtered.filter(t => !openLoan(t))

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
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Tools</h1>
        <Link
          href="/tools/new"
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

      {!loading && tools.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🛠️</p>
          <p className="font-medium">No tools yet</p>
          <p className="text-sm mt-1">
            <Link href="/tools/new" className="text-blue-500 underline">Add your first tool</Link>
          </p>
        </div>
      )}

      {!loading && tools.length > 0 && filtered.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm py-8 text-center">
          No tools match the active filters.
        </p>
      )}

      {onLoan.length > 0 && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">Out on loan</h2>
          <ul className="space-y-2">
            {onLoan.map(t => <li key={t.id}><ToolRow tool={t} /></li>)}
          </ul>
        </section>
      )}

      {available.length > 0 && (
        <ul className="space-y-2">
          {available.map(t => <li key={t.id}><ToolRow tool={t} /></li>)}
        </ul>
      )}
    </div>
  )
}
