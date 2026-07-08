'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { LOCATION_ICON_CHOICES } from '@/lib/storage'
import type { Equipment, Part } from '@/lib/types'

type Mode = null | 'sublocation' | 'move'

const tile =
  'flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 ' +
  'bg-white dark:bg-slate-800 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 ' +
  'hover:border-blue-300 dark:hover:border-blue-700 transition-colors'

// "Add to this place" panel for the storage contents page: quick links to create
// a new asset/part already located here, an inline sub-location creator, and a
// picker that moves an existing item into this place.
export default function AddToLocation({ locationId, onChanged }: {
  locationId: string
  onChanged: () => void
}) {
  const [mode, setMode] = useState<Mode>(null)

  // sub-location
  const [subName, setSubName] = useState('')
  const [subIcon, setSubIcon] = useState('')
  const [busy, setBusy] = useState(false)

  // move existing (candidates loaded lazily on first open)
  const [candidates, setCandidates] = useState<{ equipment: Equipment[]; parts: Part[] } | null>(null)
  const [search, setSearch] = useState('')
  const [movingId, setMovingId] = useState<string | null>(null)

  function toggle(m: Mode) { setMode(cur => (cur === m ? null : m)) }

  async function openMove() {
    toggle('move')
    if (!candidates) {
      const [equipment, parts] = await Promise.all([api.equipment.list(), api.parts.list()])
      setCandidates({ equipment, parts })
    }
  }

  async function createSub() {
    const name = subName.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.storageLocations.create(name, locationId, subIcon || undefined)
      setSubName(''); setSubIcon(''); setMode(null)
      onChanged()
    } finally { setBusy(false) }
  }

  async function moveEquipment(e: Equipment) {
    setMovingId(e.id)
    try {
      await api.equipment.update(e.id, {
        name: e.name,
        kind: e.kind,
        categoryId: e.categoryId ?? undefined,
        storageLocationId: locationId,
        imageUrl: e.imageUrl ?? undefined,
        notes: e.notes ?? undefined,
        usedOnEquipmentId: e.usedOnEquipmentId ?? undefined,
      })
      setCandidates(c => c && { ...c, equipment: c.equipment.map(x => x.id === e.id ? { ...x, storageLocationId: locationId } : x) })
      onChanged()
    } finally { setMovingId(null) }
  }

  async function movePart(p: Part) {
    setMovingId(p.id)
    try {
      await api.parts.update(p.id, {
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        minQuantity: p.minQuantity ?? undefined,
        equipmentId: p.equipmentId ?? undefined,
        partCategoryId: p.partCategoryId ?? undefined,
        storageLocationId: locationId,
      })
      setCandidates(c => c && { ...c, parts: c.parts.map(x => x.id === p.id ? { ...x, storageLocationId: locationId } : x) })
      onChanged()
    } finally { setMovingId(null) }
  }

  const term = search.trim().toLowerCase()
  // Only items not already here; freshly-moved items drop out because their
  // storageLocationId now matches this place.
  const eqHits = (candidates?.equipment ?? [])
    .filter(e => e.storageLocationId !== locationId && (!term || e.name.toLowerCase().includes(term)))
  const partHits = (candidates?.parts ?? [])
    .filter(p => p.storageLocationId !== locationId && (!term || p.name.toLowerCase().includes(term)))
  const noHits = eqHits.length === 0 && partHits.length === 0

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Add</h2>

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/equipment/new?location=${locationId}`} className={tile}>
          <span className="text-xl leading-none">🔧</span>New asset here
        </Link>
        <Link href={`/parts/new?location=${locationId}`} className={tile}>
          <span className="text-xl leading-none">🔩</span>New part here
        </Link>
        <button type="button" onClick={() => toggle('sublocation')}
          className={`${tile} ${mode === 'sublocation' ? 'border-blue-400 dark:border-blue-600' : ''}`}>
          <span className="text-xl leading-none">📁</span>New sub-location
        </button>
        <button type="button" onClick={openMove}
          className={`${tile} ${mode === 'move' ? 'border-blue-400 dark:border-blue-600' : ''}`}>
          <span className="text-xl leading-none">📦</span>Move item here
        </button>
      </div>

      {mode === 'sublocation' && (
        <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <input autoFocus value={subName} onChange={e => setSubName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createSub() }}
              placeholder="New place inside…" className="field flex-1" />
            <button onClick={createSub} disabled={!subName.trim() || busy}
              className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {LOCATION_ICON_CHOICES.map(c => (
              <button key={c} type="button" onClick={() => setSubIcon(c)}
                className={`w-7 h-7 rounded-lg text-base leading-none ${subIcon === c ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                {c}
              </button>
            ))}
            {subIcon && <button type="button" onClick={() => setSubIcon('')} className="text-xs text-slate-400 underline px-1">default</button>}
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search equipment or parts…" className="field" />
          {!candidates ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Loading…</p>
          ) : noHits ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-2">Nothing else to move here.</p>
          ) : (
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {eqHits.map(e => (
                <li key={e.id}>
                  <button onClick={() => moveEquipment(e)} disabled={movingId === e.id}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                    <span className="text-base leading-none">{e.kind === 'Tool' ? '🛠️' : '🔧'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{e.name}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">{e.storageLocation?.name ?? 'No location'}</span>
                    </span>
                    <span className="text-blue-500 text-sm font-medium shrink-0">{movingId === e.id ? '…' : 'Move'}</span>
                  </button>
                </li>
              ))}
              {partHits.map(p => (
                <li key={p.id}>
                  <button onClick={() => movePart(p)} disabled={movingId === p.id}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                    <span className="text-base leading-none">🔩</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{p.name}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">{p.storageLocation?.name ?? 'No location'}</span>
                    </span>
                    <span className="text-blue-500 text-sm font-medium shrink-0">{movingId === p.id ? '…' : 'Move'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
