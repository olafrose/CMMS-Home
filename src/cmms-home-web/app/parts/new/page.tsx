'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import EntityCombobox from '@/components/EntityCombobox'
import StoragePicker from '@/components/StoragePicker'
import type { Asset, PartCategory } from '@/lib/types'

const UNIT_SUGGESTIONS = ['each', 'L', 'mL', 'kg', 'g', 'm', 'cm', 'pack']

export default function NewPartPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [minQuantity, setMinQuantity] = useState('')
  const [assetId, setAssetId] = useState('')
  const [partCategoryId, setPartCategoryId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('')
  const [shelfId, setShelfId] = useState('')
  const [boxId, setBoxId] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [partCategories, setPartCategories] = useState<PartCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.assets.list(), api.partCategories.list()])
      .then(([asts, cats]) => { setAssets(asts); setPartCategories(cats) })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!quantity || isNaN(Number(quantity))) { setError('Quantity is required'); return }
    if (!unit.trim()) { setError('Unit is required'); return }
    setSaving(true)
    try {
      const part = await api.parts.create({
        name: name.trim(),
        quantity: Number(quantity),
        unit: unit.trim(),
        minQuantity: minQuantity ? Number(minQuantity) : undefined,
        assetId: assetId || undefined,
        partCategoryId: partCategoryId || undefined,
        boxId: boxId || undefined,
        shelfId: !boxId && shelfId ? shelfId : undefined,
        locationId: !boxId && !shelfId && locationId ? locationId : undefined,
      })
      router.push(`/parts/${part.id}`)
    } catch {
      setError('Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/parts" className="text-blue-500 text-sm">‹ Parts</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">New Part</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Air filter" className="field" autoFocus />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity *</label>
            <input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)}
              placeholder="0" className="field" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Unit *</label>
            <input type="text" list="unit-suggestions" value={unit} onChange={e => setUnit(e.target.value)}
              placeholder="each" className="field" />
            <datalist id="unit-suggestions">
              {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Low-stock alert below
          </label>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="any" value={minQuantity} onChange={e => setMinQuantity(e.target.value)}
              placeholder="optional" className="field w-32" />
            {unit && <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">For asset (optional)</label>
          <select value={assetId} onChange={e => setAssetId(e.target.value)} className="field">
            <option value="">— none —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category (optional)</label>
          <EntityCombobox
            items={partCategories}
            value={partCategoryId}
            onChange={setPartCategoryId}
            onCreate={async (name) => {
              const cat = await api.partCategories.create(name)
              setPartCategories(prev => [...prev, cat])
              return cat
            }}
            placeholder="Search or create…"
          />
        </div>

        <StoragePicker
          value={{ locationId, shelfId, boxId }}
          onChange={(s) => { setLocationId(s.locationId); setShelfId(s.shelfId); setBoxId(s.boxId) }}
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Part'}
        </button>
      </form>
    </div>
  )
}
