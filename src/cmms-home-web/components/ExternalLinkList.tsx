'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ExternalLink } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

// Web links (manual, spec sheet, repair video, reorder page) for one equipment or part.
// Exactly one of equipmentId/partId should be passed — that's what the API enforces.
export default function ExternalLinkList({ equipmentId, partId }: {
  equipmentId?: string
  partId?: string
}) {
  const [links, setLinks] = useState<ExternalLink[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    api.externalLinks.list({ equipmentId, partId })
      .then(setLinks)
      .finally(() => setLoading(false))
  }, [equipmentId, partId])

  function reset() {
    setAdding(false)
    setEditingId(null)
    setLabel('')
    setUrl('')
    setError('')
  }

  function startEdit(link: ExternalLink) {
    setEditingId(link.id)
    setAdding(false)
    setLabel(link.label)
    setUrl(link.url)
    setError('')
  }

  async function save() {
    if (!label.trim() || !url.trim()) return
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const updated = await api.externalLinks.update(editingId, { url, label })
        setLinks(prev => prev.map(l => l.id === editingId ? updated : l))
      } else {
        const created = await api.externalLinks.create({ url, label, equipmentId, partId })
        setLinks(prev => [...prev, created])
      }
      reset()
    } catch {
      setError('Could not save — check the URL.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(link: ExternalLink) {
    if (!confirm(`Remove the link "${link.label}"?`)) return
    await api.externalLinks.delete(link.id)
    setLinks(prev => prev.filter(l => l.id !== link.id))
  }

  if (loading) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Links{links.length > 0 ? ` (${links.length})` : ''}
        </h2>
        <button
          onClick={() => (adding || editingId ? reset() : setAdding(true))}
          className="text-sm text-blue-500 font-medium"
        >
          {adding || editingId ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {(adding || editingId) && (
        <div className={`${card} px-4 py-3 space-y-2 mb-2`}>
          <input
            autoFocus value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Label (e.g. Manual, Reorder)" className="field w-full text-sm"
          />
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder="example.com/manual.pdf" inputMode="url" className="field w-full text-sm"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={save}
            disabled={saving || !label.trim() || !url.trim()}
            className="w-full bg-blue-600 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Saving…' : editingId ? 'Save link' : 'Add link'}
          </button>
        </div>
      )}

      {links.length === 0 && !adding && !editingId && (
        <p className="text-sm text-slate-400 dark:text-slate-500">No links yet.</p>
      )}

      <ul className="space-y-2">
        {links.map(link => (
          <li key={link.id} className={`flex items-center gap-3 ${card} px-4 py-3`}>
            <span className="text-lg leading-none">🔗</span>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0"
            >
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate">{link.label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{link.url}</p>
            </a>
            <button
              onClick={() => startEdit(link)}
              className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none"
              aria-label="Edit link"
            >✏️</button>
            <button
              onClick={() => remove(link)}
              className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none"
              aria-label="Delete link"
            >🗑️</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
