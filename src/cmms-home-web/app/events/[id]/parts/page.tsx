'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Part, PartUsage } from '@/lib/types'

export default function EventPartsPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const assetId = searchParams.get('asset_id') ?? ''

  const [usages, setUsages] = useState<PartUsage[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [partId, setPartId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([api.partUsages.list(eventId), api.parts.list()])
      .then(([u, p]) => { setUsages(u); setParts(p) })
      .finally(() => setLoading(false))
  }, [eventId])

  const filteredParts = search.trim()
    ? parts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : parts

  async function handleAdd() {
    if (!partId || !quantity) return
    setAdding(true)
    try {
      const usage = await api.partUsages.create(eventId, partId, Number(quantity))
      setUsages(prev => [...prev, usage])
      setParts(prev => prev.map(p => p.id === partId ? { ...p, quantity: p.quantity - Number(quantity) } : p))
      setPartId('')
      setQuantity('1')
      setSearch('')
    } finally { setAdding(false) }
  }

  async function handleRemove(usage: PartUsage) {
    await api.partUsages.delete(usage.id)
    setUsages(prev => prev.filter(u => u.id !== usage.id))
    setParts(prev => prev.map(p => p.id === usage.partId ? { ...p, quantity: p.quantity + usage.quantityUsed } : p))
  }

  const selectedPart = parts.find(p => p.id === partId)
  const backHref = assetId ? `/assets/${assetId}` : '/parts'

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Parts Used</h1>
      </div>

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

      {/* Current usages */}
      {usages.length > 0 && (
        <ul className="space-y-2 mb-6">
          {usages.map(u => (
            <li key={u.id} className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{u.part.name}</p>
                <p className="text-xs text-slate-400">{u.quantityUsed} {u.part.unit}</p>
              </div>
              <button onClick={() => handleRemove(u)} className="text-slate-400 hover:text-red-500 text-xl leading-none px-1" aria-label="Remove">×</button>
            </li>
          ))}
        </ul>
      )}

      {/* Add usage form */}
      {!loading && parts.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">
          No parts in inventory yet. <Link href="/parts/new" className="text-blue-500 underline">Add a part</Link> first.
        </p>
      )}

      {parts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-4 space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Add part used</p>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPartId('') }}
            placeholder="Search parts…" className="field" />
          {search.trim() && (
            <ul className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
              {filteredParts.map(p => (
                <li key={p.id}>
                  <button type="button"
                    onClick={() => { setPartId(p.id); setSearch(p.name) }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${partId === p.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                    {p.name} <span className="text-slate-400 text-xs">({p.quantity} {p.unit} in stock)</span>
                  </button>
                </li>
              ))}
              {filteredParts.length === 0 && (
                <li className="px-4 py-2.5 text-sm text-slate-400">No parts found</li>
              )}
            </ul>
          )}
          {partId && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Quantity {selectedPart && `(${selectedPart.unit})`}
                </label>
                <input type="number" min="0.01" step="any" value={quantity} onChange={e => setQuantity(e.target.value)}
                  className="field" />
              </div>
              <button onClick={handleAdd} disabled={adding || !quantity}
                className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
                {adding ? '…' : 'Add'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <Link href={backHref}
          className="block w-full text-center bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-3 rounded-xl">
          Done
        </Link>
      </div>
    </div>
  )
}
