'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

const EVENT_TYPES = [
  { value: 'maintenance', label: '🔩 Maintenance', color: 'border-blue-400 bg-blue-50 text-blue-700' },
  { value: 'cleaning', label: '🧹 Cleaning', color: 'border-teal-400 bg-teal-50 text-teal-700' },
  { value: 'repair', label: '🛠 Repair', color: 'border-red-400 bg-red-50 text-red-700' },
  { value: 'replacement', label: '🔄 Replacement', color: 'border-purple-400 bg-purple-50 text-purple-700' },
]

export default function LogMaintenancePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [type, setType] = useState('maintenance')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api.events.create({ assetId: id, type, note: note.trim() || undefined })
      router.push(`/assets/${id}`)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/assets/${id}`} className="text-blue-600 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800">Log Maintenance</h1>
      </div>

      {/* Type picker */}
      <div className="grid grid-cols-2 gap-3">
        {EVENT_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`border-2 rounded-xl py-4 text-sm font-semibold transition-all ${
              type === t.value ? t.color + ' border-current' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Optional note */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What did you do?"
          className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl shadow text-lg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
