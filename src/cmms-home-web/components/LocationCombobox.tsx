'use client'

import { useEffect, useRef, useState } from 'react'
import type { Location } from '@/lib/types'

interface Props {
  locations: Location[]
  value: string | null
  onChange: (locationId: string | null) => void
  onCreateLocation: (name: string) => Promise<Location>
}

export default function LocationCombobox({ locations, value, onChange, onCreateLocation }: Props) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Sync display text when value or locations list changes
  useEffect(() => {
    if (!open) setInput(locations.find(l => l.id === value)?.name ?? '')
  }, [value, locations, open])

  const filtered = input.trim()
    ? locations.filter(l => l.name.toLowerCase().includes(input.toLowerCase()))
    : locations

  const exactMatch = locations.some(l => l.name.toLowerCase() === input.trim().toLowerCase())
  const showCreate = input.trim().length > 0 && !exactMatch

  function handleSelect(loc: Location) {
    onChange(loc.id)
    setInput(loc.name)
    setOpen(false)
  }

  async function handleCreate() {
    const name = input.trim()
    if (!name) return
    setCreating(true)
    try {
      const loc = await onCreateLocation(name)
      onChange(loc.id)
      setInput(loc.name)
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  function handleBlur() {
    // Allow mousedown handlers on dropdown items to fire first
    setTimeout(() => {
      setOpen(false)
      // Revert display text to the committed value
      setInput(locations.find(l => l.id === value)?.name ?? '')
    }, 150)
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder="e.g. Basement, Garage"
          className="field pr-8"
        />
        {value && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(null); setInput('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Clear location"
          >
            ×
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(loc => (
            <li key={loc.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(loc) }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {loc.name}
              </button>
            </li>
          ))}
          {showCreate && (
            <li className="border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleCreate() }}
                disabled={creating}
                className="w-full text-left px-4 py-2.5 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {creating ? 'Creating…' : `+ Create "${input.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
