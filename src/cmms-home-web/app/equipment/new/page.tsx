'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Category, EquipmentKind } from '@/lib/types'
import EntityCombobox from '@/components/EntityCombobox'
import StorageLocationPicker from '@/components/StorageLocationPicker'

const KIND_OPTIONS: { value: EquipmentKind; label: string }[] = [
  { value: 'Asset', label: 'Asset' },
  { value: 'Tool', label: 'Tool' },
  { value: 'Both', label: 'Both' },
]

function initialKind(): EquipmentKind {
  if (typeof window === 'undefined') return 'Asset'
  const k = new URLSearchParams(window.location.search).get('kind')
  if (k === 'tool') return 'Tool'
  return 'Asset'
}

// Prefill the place when arriving from a storage page's "add here" action.
function initialLocation(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('location')
}

export default function NewEquipmentPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<EquipmentKind>(initialKind)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [storageLocationId, setStorageLocationId] = useState<string | null>(initialLocation)
  const [notes, setNotes] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.categories.list().then(setCategories)
  }, [])

  async function handleCreateCategory(name: string) {
    const cat = await api.categories.create(name)
    setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
    return cat
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const created = await api.equipment.create({
        name: name.trim(),
        kind,
        categoryId: categoryId ?? undefined,
        storageLocationId: storageLocationId ?? undefined,
        notes: notes.trim() || undefined,
      })
      router.push(`/equipment/${created.id}`)
    } catch {
      setError('Failed to save equipment')
      setSaving(false)
    }
  }

  const backHref = kind === 'Tool' ? '/tools' : '/assets'

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">New Equipment</h1>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kind</label>
          <div className="grid grid-cols-3 gap-2">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`border-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                  kind === k.value
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Stored at</label>
          <StorageLocationPicker value={storageLocationId} onChange={setStorageLocationId} placeholder="e.g. Basement, Garage" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional notes"
            className="field resize-none"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50 mt-2"
        >
          {saving ? 'Saving…' : 'Save Equipment'}
        </button>
      </form>
    </div>
  )
}
