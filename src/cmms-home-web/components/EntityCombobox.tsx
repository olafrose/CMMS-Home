'use client'

import { useEffect, useState } from 'react'

interface Item {
  id: string
  name: string
}

interface Props {
  items: Item[]
  value: string | null
  onChange: (id: string | null) => void
  onCreate: (name: string) => Promise<Item>
  placeholder?: string
}

export default function EntityCombobox({ items, value, onChange, onCreate, placeholder }: Props) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) setInput(items.find(i => i.id === value)?.name ?? '')
  }, [value, items, open])

  const filtered = input.trim()
    ? items.filter(i => i.name.toLowerCase().includes(input.toLowerCase()))
    : items

  const exactMatch = items.some(i => i.name.toLowerCase() === input.trim().toLowerCase())
  const showCreate = input.trim().length > 0 && !exactMatch

  function handleSelect(item: Item) {
    onChange(item.id)
    setInput(item.name)
    setOpen(false)
  }

  async function handleCreate() {
    const name = input.trim()
    if (!name) return
    setCreating(true)
    try {
      const item = await onCreate(name)
      onChange(item.id)
      setInput(item.name)
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  function handleBlur() {
    setTimeout(() => {
      setOpen(false)
      setInput(items.find(i => i.id === value)?.name ?? '')
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
          placeholder={placeholder}
          className="field pr-8"
        />
        {value && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(null); setInput('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(item => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {item.name}
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
