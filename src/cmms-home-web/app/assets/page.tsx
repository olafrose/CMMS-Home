'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Asset } from '@/lib/types'

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.assets.list()
      .then(setAssets)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Assets</h1>
        <Link
          href="/assets/new"
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow"
        >
          + New
        </Link>
      </div>

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
        {assets.map((asset) => (
          <li key={asset.id}>
            <Link
              href={`/assets/${asset.id}`}
              className="flex items-center gap-4 bg-white dark:bg-slate-800 rounded-xl px-4 py-4 shadow-sm border border-slate-100 dark:border-slate-700"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{asset.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                  {[asset.category, asset.location].filter(Boolean).join(' · ') || 'No details'}
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
