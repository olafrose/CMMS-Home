'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { CATEGORY_COLORS, categoryBadgeStyle } from '@/lib/documents'
import type { DocumentCategory } from '@/lib/types'

// Manages document categories (name + color + a "sensitive" flag). Sensitive categories are
// hidden from anyone without the documents.read_sensitive permission.
export default function DocumentCategoryManager() {
  const [items, setItems] = useState<DocumentCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[5])
  const [newSensitive, setNewSensitive] = useState(false)

  useEffect(() => { api.documentCategories.list().then(setItems).finally(() => setLoading(false)) }, [])

  async function add() {
    const name = newName.trim()
    if (!name) return
    const cat = await api.documentCategories.create(name, newSensitive, newColor)
    setItems(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName(''); setNewSensitive(false)
  }
  async function patch(c: DocumentCategory, changes: Partial<DocumentCategory>) {
    const next = { ...c, ...changes }
    const updated = await api.documentCategories.update(c.id, next.name.trim(), next.sensitive, next.color)
    setItems(prev => prev.map(i => i.id === c.id ? updated : i))
  }
  async function remove(c: DocumentCategory) {
    if (!confirm(`Delete "${c.name}"? It will be removed from any documents using it.`)) return
    await api.documentCategories.delete(c.id)
    setItems(prev => prev.filter(i => i.id !== c.id))
  }

  function Palette({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORY_COLORS.map(c => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-label={c}
            className={`w-6 h-6 rounded-full ${value === c ? 'ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-800' : ''}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
    )
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Document categories</h2>

      <div className="space-y-2 mb-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} placeholder="New document category" className="field flex-1" />
          <button onClick={add} disabled={!newName.trim()}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">Add</button>
        </div>
        <div className="flex items-center justify-between">
          <Palette value={newColor} onPick={setNewColor} />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={newSensitive} onChange={e => setNewSensitive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            Sensitive
          </label>
        </div>
      </div>

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}
      {!loading && items.length === 0 && <p className="text-slate-400 dark:text-slate-500 text-sm py-2">None yet.</p>}

      <ul className="space-y-2">
        {items.map(c => (
          <li key={c.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={categoryBadgeStyle(c.color)}>{c.name}</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={c.sensitive} onChange={e => patch(c, { sensitive: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                Sensitive
              </label>
              <button onClick={() => remove(c)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none" aria-label="Delete">🗑️</button>
            </div>
            <Palette value={c.color} onPick={color => patch(c, { color })} />
          </li>
        ))}
      </ul>
    </section>
  )
}
