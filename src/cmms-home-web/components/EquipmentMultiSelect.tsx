'use client'

import { useEffect, useState } from 'react'
import type { Equipment } from '@/lib/types'

interface Props {
  equipment: Equipment[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}

// Multi-select over existing equipment: chosen assets show as removable chips,
// a typeahead dropdown adds more. No "create" (equipment is made in its own flow).
export default function EquipmentMultiSelect({ equipment, value, onChange, placeholder }: Props) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)

  const byId = new Map(equipment.map(e => [e.id, e]))
  const selected = value.map(id => byId.get(id)).filter(Boolean) as Equipment[]

  const term = input.trim().toLowerCase()
  const options = equipment
    .filter(e => !value.includes(e.id) && (!term || e.name.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50)

  function add(id: string) { onChange([...value, id]); setInput('') }
  function remove(id: string) { onChange(value.filter(v => v !== id)) }

  useEffect(() => { if (!open) setInput('') }, [open])

  return (
    <div className="relative">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(e => (
            <span key={e.id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-sm bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {e.name}
              <button type="button" onClick={() => remove(e.id)} aria-label={`Remove ${e.name}`}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Search equipment…'}
        className="field"
      />

      {open && options.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {options.map(e => (
            <li key={e.id}>
              <button
                type="button"
                onMouseDown={ev => { ev.preventDefault(); add(e.id) }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {e.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
