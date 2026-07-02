'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { locationPath } from '@/lib/storage'
import type { StorageLocation } from '@/lib/types'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
}

// Typeahead over the whole flat place list, showing each option's full breadcrumb
// path so deep nesting stays usable. Typing a new name creates a top-level place
// (reorganize/nest it later on the Storage page).
export default function StorageLocationPicker({ value, onChange, placeholder }: Props) {
  const [all, setAll] = useState<StorageLocation[]>([])
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => { api.storageLocations.list().then(setAll).catch(() => {}) }, [])

  const selectedLabel = value ? locationPath(value, all) : ''
  useEffect(() => { if (!open) setInput(selectedLabel) }, [selectedLabel, open])

  const term = input.trim().toLowerCase()
  const options = all
    .map(l => ({ id: l.id, label: locationPath(l.id, all) }))
    .filter(o => !term || o.label.toLowerCase().includes(term))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 50)

  const exact = all.some(l => l.name.toLowerCase() === term)
  const showCreate = term.length > 0 && !exact

  async function handleCreate() {
    const name = input.trim()
    if (!name) return
    setCreating(true)
    try {
      const loc = await api.storageLocations.create(name)
      setAll(prev => [...prev, loc])
      onChange(loc.id)
      setInput(loc.name)
      setOpen(false)
    } finally { setCreating(false) }
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setInput(selectedLabel) }, 150)}
          placeholder={placeholder ?? 'Search or create a place…'}
          className="field pr-8"
        />
        {value && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(null); setInput('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && (options.length > 0 || showCreate) && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {options.map(o => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onChange(o.id); setInput(o.label); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {o.label}
              </button>
            </li>
          ))}
          {showCreate && (
            <li className="border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleCreate() }}
                disabled={creating}
                className="w-full text-left px-4 py-2.5 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {creating ? 'Creating…' : `+ Create "${input.trim()}" (top level)`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
