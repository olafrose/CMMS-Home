'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Location, Shelf, StorageBox } from '@/lib/types'

function ShelfSection({ shelf, boxes, shelves, locations, onRenameShelf, onDeleteShelf, onAddBox, onRenameBox, onDeleteBox }: {
  shelf: Shelf
  boxes: StorageBox[]
  shelves: Shelf[]
  locations: Location[]
  onRenameShelf: (id: string, name: string, locationId: string) => Promise<void>
  onDeleteShelf: (shelf: Shelf) => Promise<void>
  onAddBox: (name: string, shelfId: string) => Promise<void>
  onRenameBox: (id: string, name: string, shelfId?: string, locationId?: string) => Promise<void>
  onDeleteBox: (box: StorageBox) => Promise<void>
}) {
  const [editingShelf, setEditingShelf] = useState(false)
  const [shelfName, setShelfName] = useState(shelf.name)
  const [shelfLocationId, setShelfLocationId] = useState(shelf.locationId)
  const [expanded, setExpanded] = useState(false)
  const [newBoxName, setNewBoxName] = useState('')
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null)
  const [editBoxName, setEditBoxName] = useState('')
  const [movingBoxId, setMovingBoxId] = useState<string | null>(null)
  const [moveLocationId, setMoveLocationId] = useState('')
  const [moveShelfId, setMoveShelfId] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editingBoxId) editRef.current?.focus() }, [editingBoxId])

  return (
    <li className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
      {editingShelf ? (
        <div className="space-y-2 p-3">
          <input type="text" value={shelfName} onChange={e => setShelfName(e.target.value)}
            className="field w-full text-sm" autoFocus />
          <div className="flex gap-2">
            <select value={shelfLocationId} onChange={e => setShelfLocationId(e.target.value)} className="field flex-1 text-sm">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={async () => { await onRenameShelf(shelf.id, shelfName.trim(), shelfLocationId); setEditingShelf(false) }}
              className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2">Save</button>
            <button onClick={() => setEditingShelf(false)} className="text-slate-400 text-sm px-1">✕</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => setExpanded(v => !v)} className="flex-1 flex items-center gap-2 text-left">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{shelf.name}</span>
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{shelf.location.name}</span>
            <span className="ml-auto text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
          </button>
          <button onClick={() => setEditingShelf(true)} className="text-slate-400 hover:text-blue-500 text-lg leading-none" aria-label="Edit">✏️</button>
          <button onClick={() => onDeleteShelf(shelf)} className="text-slate-400 hover:text-red-500 text-lg leading-none" aria-label="Delete">🗑️</button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2 bg-slate-50 dark:bg-slate-900/30">
          {boxes.map(box => (
            <div key={box.id}>
              {movingBoxId === box.id ? (
                <div className="space-y-2">
                  <select value={moveLocationId} onChange={e => { setMoveLocationId(e.target.value); setMoveShelfId('') }} className="field w-full text-sm">
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select value={moveShelfId} onChange={e => setMoveShelfId(e.target.value)} className="field flex-1 text-sm">
                      <option value="">No shelf (freestanding)</option>
                      {shelves.filter(s => s.locationId === moveLocationId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={async () => { await onRenameBox(box.id, box.name, moveShelfId || undefined, moveShelfId ? undefined : moveLocationId || undefined); setMovingBoxId(null) }}
                      className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2">Save</button>
                    <button onClick={() => setMovingBoxId(null)} className="text-slate-400 text-sm px-1">✕</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {editingBoxId === box.id ? (
                    <>
                      <input ref={editRef} type="text" value={editBoxName} onChange={e => setEditBoxName(e.target.value)}
                        onKeyDown={async e => { if (e.key === 'Enter') { await onRenameBox(box.id, editBoxName.trim(), shelf.id); setEditingBoxId(null) } if (e.key === 'Escape') setEditingBoxId(null) }}
                        className="field flex-1 text-sm" />
                      <button onClick={async () => { await onRenameBox(box.id, editBoxName.trim(), shelf.id); setEditingBoxId(null) }}
                        className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2">Save</button>
                      <button onClick={() => setEditingBoxId(null)} className="text-slate-400 text-sm px-1">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">📦 {box.name}</span>
                      <button onClick={() => { setMovingBoxId(box.id); setMoveLocationId(shelf.locationId); setMoveShelfId(shelf.id) }} className="text-slate-400 hover:text-amber-500 text-base leading-none" aria-label="Move">↗️</button>
                      <button onClick={() => { setEditingBoxId(box.id); setEditBoxName(box.name) }} className="text-slate-400 hover:text-blue-500 text-base leading-none">✏️</button>
                      <button onClick={() => onDeleteBox(box)} className="text-slate-400 hover:text-red-500 text-base leading-none">🗑️</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input type="text" value={newBoxName} onChange={e => setNewBoxName(e.target.value)}
              onKeyDown={async e => { if (e.key === 'Enter' && newBoxName.trim()) { await onAddBox(newBoxName.trim(), shelf.id); setNewBoxName('') } }}
              placeholder="New box name" className="field flex-1 text-sm" />
            <button onClick={async () => { if (newBoxName.trim()) { await onAddBox(newBoxName.trim(), shelf.id); setNewBoxName('') } }}
              disabled={!newBoxName.trim()} className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function StoragePage() {
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [boxes, setBoxes] = useState<StorageBox[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [newShelfName, setNewShelfName] = useState('')
  const [newShelfLocationId, setNewShelfLocationId] = useState('')
  const [newBoxName, setNewBoxName] = useState('')
  const [newBoxLocationId, setNewBoxLocationId] = useState('')
  const [addingShelf, setAddingShelf] = useState(false)
  const [editingFreeBoxId, setEditingFreeBoxId] = useState<string | null>(null)
  const [editFreeBoxName, setEditFreeBoxName] = useState('')
  const [movingFreeBoxId, setMovingFreeBoxId] = useState<string | null>(null)
  const [moveFreeLocationId, setMoveFreeLocationId] = useState('')
  const [moveFreeShelfId, setMoveFreeShelfId] = useState('')

  useEffect(() => {
    Promise.all([api.shelves.list(), api.boxes.list(), api.locations.list()])
      .then(([s, b, l]) => {
        setShelves(s); setBoxes(b); setLocations(l)
        if (l.length > 0) { setNewShelfLocationId(l[0].id); setNewBoxLocationId(l[0].id) }
      })
      .finally(() => setLoading(false))
  }, [])

  async function addShelf() {
    const name = newShelfName.trim()
    if (!name || !newShelfLocationId) return
    setAddingShelf(true)
    try {
      const shelf = await api.shelves.create(name, newShelfLocationId)
      setShelves(prev => [...prev, shelf].sort((a, b) => a.name.localeCompare(b.name)))
      setNewShelfName('')
    } finally { setAddingShelf(false) }
  }

  async function renameShelf(id: string, name: string, locationId: string) {
    const updated = await api.shelves.update(id, name, locationId)
    setShelves(prev => prev.map(s => s.id === id ? updated : s))
  }

  async function deleteShelf(shelf: Shelf) {
    if (!confirm(`Delete shelf "${shelf.name}"? Boxes on this shelf will become freestanding.`)) return
    await api.shelves.delete(shelf.id)
    setShelves(prev => prev.filter(s => s.id !== shelf.id))
    setBoxes(prev => prev.map(b => b.shelfId === shelf.id ? { ...b, shelfId: undefined, shelf: undefined } : b))
  }

  async function addBox(name: string, shelfId?: string, locationId?: string) {
    const box = await api.boxes.create(name, shelfId, locationId)
    setBoxes(prev => [...prev, box].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function renameBox(id: string, name: string, shelfId?: string, locationId?: string) {
    const updated = await api.boxes.update(id, name, shelfId, locationId)
    setBoxes(prev => prev.map(b => b.id === id ? updated : b))
  }

  async function deleteBox(box: StorageBox) {
    if (!confirm(`Delete box "${box.name}"? Parts inside will lose their box assignment.`)) return
    await api.boxes.delete(box.id)
    setBoxes(prev => prev.filter(b => b.id !== box.id))
  }

  const freestandingBoxes = boxes.filter(b => !b.shelfId)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/parts" className="text-blue-500 text-sm">‹ Parts</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Storage</h1>
      </div>

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

      {/* Add shelf */}
      {locations.length === 0 && !loading && (
        <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">
          Add a <Link href="/locations" className="text-blue-500 underline">location</Link> first before creating shelves.
        </p>
      )}
      {locations.length > 0 && (
        <div className="space-y-2 mb-6">
          <input type="text" value={newShelfName} onChange={e => setNewShelfName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addShelf()}
            placeholder="New shelf name" className="field w-full" />
          <div className="flex gap-2">
            <select value={newShelfLocationId} onChange={e => setNewShelfLocationId(e.target.value)} className="field flex-1">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={addShelf} disabled={addingShelf || !newShelfName.trim()}
              className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
              {addingShelf ? '…' : 'Add Shelf'}
            </button>
          </div>
        </div>
      )}

      {/* Shelves */}
      {shelves.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Shelves</h2>
          <ul className="space-y-2">
            {shelves.map(shelf => (
              <ShelfSection key={shelf.id} shelf={shelf}
                boxes={boxes.filter(b => b.shelfId === shelf.id)}
                shelves={shelves}
                locations={locations}
                onRenameShelf={renameShelf}
                onDeleteShelf={deleteShelf}
                onAddBox={(name, shelfId) => addBox(name, shelfId)}
                onRenameBox={renameBox}
                onDeleteBox={deleteBox}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Freestanding boxes */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Freestanding Boxes</h2>
        {locations.length > 0 && (
          <div className="space-y-2 mb-3">
            <input type="text" value={newBoxName} onChange={e => setNewBoxName(e.target.value)}
              onKeyDown={async e => { if (e.key === 'Enter' && newBoxName.trim()) { await addBox(newBoxName.trim(), undefined, newBoxLocationId); setNewBoxName('') } }}
              placeholder="New box name" className="field w-full" />
            <div className="flex gap-2">
            <select value={newBoxLocationId} onChange={e => setNewBoxLocationId(e.target.value)} className="field flex-1">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={async () => { if (newBoxName.trim()) { await addBox(newBoxName.trim(), undefined, newBoxLocationId); setNewBoxName('') } }}
              disabled={!newBoxName.trim()} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
              Add Box
            </button>
            </div>
          </div>
        )}
        {freestandingBoxes.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">No freestanding boxes.</p>
        )}
        <ul className="space-y-2">
          {freestandingBoxes.map(box => (
            <li key={box.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-3">
              {movingFreeBoxId === box.id ? (
                <div className="space-y-2">
                  <select value={moveFreeLocationId} onChange={e => { setMoveFreeLocationId(e.target.value); setMoveFreeShelfId('') }} className="field w-full text-sm">
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select value={moveFreeShelfId} onChange={e => setMoveFreeShelfId(e.target.value)} className="field flex-1 text-sm">
                      <option value="">No shelf (freestanding)</option>
                      {shelves.filter(s => s.locationId === moveFreeLocationId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={async () => { await renameBox(box.id, box.name, moveFreeShelfId || undefined, moveFreeShelfId ? undefined : moveFreeLocationId || undefined); setMovingFreeBoxId(null) }}
                      className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2">Save</button>
                    <button onClick={() => setMovingFreeBoxId(null)} className="text-slate-400 text-sm px-1">✕</button>
                  </div>
                </div>
              ) : editingFreeBoxId === box.id ? (
                <div className="flex items-center gap-3">
                  <input type="text" value={editFreeBoxName} onChange={e => setEditFreeBoxName(e.target.value)}
                    onKeyDown={async e => { if (e.key === 'Enter') { await renameBox(box.id, editFreeBoxName.trim(), undefined, box.locationId); setEditingFreeBoxId(null) } if (e.key === 'Escape') setEditingFreeBoxId(null) }}
                    className="field flex-1 text-sm" autoFocus />
                  <button onClick={async () => { await renameBox(box.id, editFreeBoxName.trim(), undefined, box.locationId); setEditingFreeBoxId(null) }}
                    className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2">Save</button>
                  <button onClick={() => setEditingFreeBoxId(null)} className="text-slate-400 text-sm px-1">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                    📦 {box.name}
                    {box.location && <span className="ml-2 text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{box.location.name}</span>}
                  </span>
                  <button onClick={() => { setMovingFreeBoxId(box.id); setMoveFreeLocationId(box.locationId ?? locations[0]?.id ?? ''); setMoveFreeShelfId('') }}
                    className="text-slate-400 hover:text-amber-500 text-lg leading-none" aria-label="Move">↗️</button>
                  <button onClick={() => { setEditingFreeBoxId(box.id); setEditFreeBoxName(box.name) }}
                    className="text-slate-400 hover:text-blue-500 text-lg leading-none" aria-label="Edit">✏️</button>
                  <button onClick={() => deleteBox(box)} className="text-slate-400 hover:text-red-500 text-lg leading-none">🗑️</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
