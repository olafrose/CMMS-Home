'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { MaintenanceEvent, Part, PartUsage } from '@/lib/types'

const EVENT_TYPES = [
  { value: 'maintenance', label: '🔩 Maintenance', active: 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  { value: 'cleaning',    label: '🧹 Cleaning',    active: 'border-teal-400 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
  { value: 'repair',      label: '🛠 Repair',      active: 'border-red-400 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  { value: 'replacement', label: '🔄 Replacement', active: 'border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
]

const eventTypeColor: Record<string, string> = {
  maintenance: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  repair: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  cleaning: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  replacement: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
}

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EventDetailPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const assetId = searchParams.get('asset_id') ?? ''
  const backHref = assetId ? `/assets/${assetId}` : '/assets'

  const [event, setEvent] = useState<MaintenanceEvent | null>(null)
  const [usages, setUsages] = useState<PartUsage[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)

  // Edit event
  const [editing, setEditing] = useState(false)
  const [editType, setEditType] = useState('maintenance')
  const [editNote, setEditNote] = useState('')
  const [editDate, setEditDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Add part usage
  const [partId, setPartId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([api.events.get(eventId), api.partUsages.list(eventId), api.parts.list()])
      .then(([e, u, p]) => { setEvent(e); setUsages(u); setParts(p) })
      .finally(() => setLoading(false))
  }, [eventId])

  function startEdit() {
    if (!event) return
    setEditType(event.type)
    setEditNote(event.note ?? '')
    setEditDate(new Date(event.createdAt).toISOString().slice(0, 10))
    setEditing(true)
  }

  async function handleSaveEdit() {
    setSavingEdit(true)
    try {
      const updated = await api.events.update(eventId, {
        type: editType,
        note: editNote.trim() || undefined,
        occurredAt: editDate ? new Date(editDate).toISOString() : undefined,
      })
      setEvent(updated)
      setEditing(false)
    } finally { setSavingEdit(false) }
  }

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

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!event) return <div className="p-6 text-red-500 text-sm">Event not found</div>

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex-1">Event</h1>
        {!editing && (
          <button onClick={startEdit} className="text-sm text-blue-500 font-medium">Edit</button>
        )}
      </div>

      {/* Event card */}
      {editing ? (
        <div className={`${card} px-4 py-4 space-y-4`}>
          <div className="grid grid-cols-2 gap-3">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setEditType(t.value)}
                className={`border-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                  editType === t.value
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
            <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3}
              placeholder="What did you do?" className="field resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="field" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={savingEdit}
              className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
              {savingEdit ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={`${card} px-4 py-4 space-y-2`}>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${eventTypeColor[event.type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {event.type}
            </span>
            <span className="text-sm text-slate-400 dark:text-slate-500">{formatDate(event.createdAt)}</span>
          </div>
          {event.note && <p className="text-sm text-slate-700 dark:text-slate-200">{event.note}</p>}
        </div>
      )}

      {/* Parts used */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Parts Used</h2>

        {usages.length > 0 && (
          <ul className="space-y-2 mb-3">
            {usages.map(u => (
              <li key={u.id} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{u.part.name}</p>
                  <p className="text-xs text-slate-400">{u.quantityUsed} {u.part.unit}</p>
                </div>
                <button onClick={() => handleRemove(u)} className="text-slate-400 hover:text-red-500 text-xl leading-none px-1" aria-label="Remove">×</button>
              </li>
            ))}
          </ul>
        )}

        {!loading && parts.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No parts in inventory yet. <Link href="/parts/new" className="text-blue-500 underline">Add a part</Link> first.
          </p>
        )}

        {parts.length > 0 && (
          <div className={`${card} px-4 py-4 space-y-3`}>
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
      </section>

      {/* Documents section will mount here in document-management Phase 2 (GET /documents?event_id=). */}

      <Link href={backHref}
        className="block w-full text-center bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-3 rounded-xl">
        Done
      </Link>
    </div>
  )
}
