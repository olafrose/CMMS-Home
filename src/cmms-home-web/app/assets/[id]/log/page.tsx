'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

const EVENT_TYPES = [
  { value: 'maintenance', label: '🔩 Maintenance', active: 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  { value: 'cleaning',    label: '🧹 Cleaning',    active: 'border-teal-400 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
  { value: 'repair',      label: '🛠 Repair',      active: 'border-red-400 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  { value: 'replacement', label: '🔄 Replacement', active: 'border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
]

export default function LogMaintenancePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [type, setType] = useState('maintenance')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const event = await api.events.create({
        assetId: id,
        type,
        note: note.trim() || undefined,
        occurredAt: new Date(date).toISOString(),
      })
      router.push(`/events/${event.id}?asset_id=${id}`)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/assets/${id}`} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Log Maintenance</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {EVENT_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`border-2 rounded-xl py-4 text-sm font-semibold transition-all ${
              type === t.value
                ? t.active + ' border-current'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What did you do?"
          className="field resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
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
