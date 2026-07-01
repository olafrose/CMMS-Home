'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import EntityCombobox from '@/components/EntityCombobox'
import StoragePicker from '@/components/StoragePicker'
import type { Asset, ToolCategory } from '@/lib/types'

export default function NewToolPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [assetId, setAssetId] = useState('')
  const [toolCategoryId, setToolCategoryId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('')
  const [shelfId, setShelfId] = useState('')
  const [boxId, setBoxId] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [toolCategories, setToolCategories] = useState<ToolCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.assets.list(), api.toolCategories.list()])
      .then(([asts, cats]) => { setAssets(asts); setToolCategories(cats) })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const tool = await api.tools.create({
        name: name.trim(),
        notes: notes.trim() || undefined,
        assetId: assetId || undefined,
        toolCategoryId: toolCategoryId || undefined,
        boxId: boxId || undefined,
        shelfId: !boxId && shelfId ? shelfId : undefined,
        locationId: !boxId && !shelfId && locationId ? locationId : undefined,
      })
      router.push(`/tools/${tool.id}`)
    } catch {
      setError('Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tools" className="text-blue-500 text-sm">‹ Tools</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">New Tool</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Cordless drill" className="field" autoFocus />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category (optional)</label>
          <EntityCombobox
            items={toolCategories}
            value={toolCategoryId}
            onChange={setToolCategoryId}
            onCreate={async (name) => {
              const cat = await api.toolCategories.create(name)
              setToolCategories(prev => [...prev, cat])
              return cat
            }}
            placeholder="Search or create…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">For asset (optional)</label>
          <select value={assetId} onChange={e => setAssetId(e.target.value)} className="field">
            <option value="">— none —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="e.g. condition, purchase date, warranty" className="field" />
        </div>

        <StoragePicker
          value={{ locationId, shelfId, boxId }}
          onChange={(s) => { setLocationId(s.locationId); setShelfId(s.shelfId); setBoxId(s.boxId) }}
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl shadow disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Tool'}
        </button>
      </form>
    </div>
  )
}
