'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Category, Location } from '@/lib/types'
import EntityCombobox from '@/components/EntityCombobox'

export default function NewAssetPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.categories.list(), api.locations.list()])
      .then(([cats, locs]) => { setCategories(cats); setLocations(locs) })
  }, [])

  async function handleCreateCategory(name: string) {
    const cat = await api.categories.create(name)
    setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
    return cat
  }

  async function handleCreateLocation(name: string) {
    const loc = await api.locations.create(name)
    setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)))
    return loc
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const asset = await api.assets.create({
        name: name.trim(),
        categoryId: categoryId ?? undefined,
        locationId: locationId ?? undefined,
      })
      router.push(`/assets/${asset.id}`)
    } catch {
      setError('Failed to save asset')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assets" className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">New Asset</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Washing Machine"
            className="field"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
          <EntityCombobox
            items={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCreate={handleCreateCategory}
            placeholder="e.g. Appliance, HVAC, Vehicle"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location</label>
          <EntityCombobox
            items={locations}
            value={locationId}
            onChange={setLocationId}
            onCreate={handleCreateLocation}
            placeholder="e.g. Basement, Garage"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50 mt-2"
        >
          {saving ? 'Saving…' : 'Save Asset'}
        </button>
      </form>
    </div>
  )
}
