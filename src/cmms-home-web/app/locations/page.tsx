'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Location } from '@/lib/types'

export default function LocationsPage() {
  const [items, setItems] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.locations.list().then(setItems).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  function startEdit(item: Location) {
    setEditingId(item.id)
    setEditName(item.name)
  }

  async function handleSave(id: string) {
    const name = editName.trim()
    if (!name) return
    const updated = await api.locations.update(id, name)
    setItems(prev => prev.map(i => i.id === id ? updated : i))
    setEditingId(null)
  }

  async function handleDelete(item: Location) {
    if (!confirm(`Delete "${item.name}"? It will be removed from all assets assigned to it.`)) return
    await api.locations.delete(item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      const item = await api.locations.create(name)
      setItems(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assets" className="text-blue-500 text-sm">‹ Assets</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Locations</h1>
      </div>

      {/* Add new */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="New location name"
          className="field flex-1"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
        >
          {adding ? '…' : 'Add'}
        </button>
      </div>

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-8">No locations yet.</p>
      )}

      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-3">
            {editingId === item.id ? (
              <div className="flex gap-2">
                <input
                  ref={editRef}
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(item.id); if (e.key === 'Escape') setEditingId(null) }}
                  className="field flex-1"
                />
                <button
                  onClick={() => handleSave(item.id)}
                  disabled={!editName.trim()}
                  className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-slate-400 dark:text-slate-500 text-sm px-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="flex-1 text-slate-800 dark:text-slate-100 font-medium">{item.name}</span>
                <button
                  onClick={() => startEdit(item)}
                  className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none"
                  aria-label="Rename"
                >✏️</button>
                <button
                  onClick={() => handleDelete(item)}
                  className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none"
                  aria-label="Delete"
                >🗑️</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
