'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function NewAssetPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const asset = await api.assets.create({ name: name.trim(), category: category || undefined, location: location || undefined })
      router.push(`/assets/${asset.id}`)
    } catch {
      setError('Failed to save asset')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assets" className="text-blue-600 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800">New Asset</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Washing Machine"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Appliance, HVAC, Vehicle"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Basement, Garage"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

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
