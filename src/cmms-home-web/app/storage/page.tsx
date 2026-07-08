'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { childrenOf, locationPath, DEFAULT_LOCATION_ICON, LOCATION_ICON_CHOICES } from '@/lib/storage'
import type { StorageLocation } from '@/lib/types'

function descendantIds(id: string, all: StorageLocation[]): Set<string> {
  const out = new Set<string>([id])
  let added = true
  while (added) {
    added = false
    for (const l of all) {
      if (l.parentId && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); added = true }
    }
  }
  return out
}

function Node({ node, all, depth, onAdd, onRename, onMove, onDelete }: {
  node: StorageLocation
  all: StorageLocation[]
  depth: number
  onAdd: (parentId: string, name: string) => Promise<void>
  onRename: (id: string, name: string, icon?: string) => Promise<void>
  onMove: (id: string, parentId?: string) => Promise<void>
  onDelete: (node: StorageLocation) => Promise<void>
}) {
  const kids = childrenOf(node.id, all)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name)
  const [icon, setIcon] = useState(node.icon ?? '')
  const [adding, setAdding] = useState(false)
  const [childName, setChildName] = useState('')
  const [moving, setMoving] = useState(false)

  const invalidParents = useMemo(() => descendantIds(node.id, all), [node.id, all])

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
        style={{ marginLeft: depth * 16 }}>
        <button onClick={() => setExpanded(v => !v)} className="text-slate-400 w-4 text-sm" aria-label="Expand">
          {kids.length ? (expanded ? '▾' : '▸') : '·'}
        </button>
        {editing ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={async e => { if (e.key === 'Enter') { await onRename(node.id, name.trim(), icon || undefined); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
            className="field flex-1 text-sm py-1" />
        ) : (
          <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
            <span className="mr-1.5">{node.icon || DEFAULT_LOCATION_ICON}</span>{node.name}
          </span>
        )}
        {editing ? (
          <>
            <button onClick={async () => { await onRename(node.id, name.trim(), icon || undefined); setEditing(false) }}
              className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2">Save</button>
            <button onClick={() => setEditing(false)} className="text-slate-400 text-sm px-1">✕</button>
          </>
        ) : (
          <>
            <Link href={`/storage/${node.id}`} className="text-slate-400 hover:text-blue-500" aria-label="Contents">🔍</Link>
            <button onClick={() => { setAdding(v => !v); setExpanded(true) }} className="text-slate-400 hover:text-blue-500" aria-label="Add child">＋</button>
            <button onClick={() => { setEditing(true); setName(node.name); setIcon(node.icon ?? '') }} className="text-slate-400 hover:text-blue-500" aria-label="Rename">✏️</button>
            <button onClick={() => setMoving(v => !v)} className="text-slate-400 hover:text-amber-500" aria-label="Move">↗️</button>
            <button onClick={() => onDelete(node)} className="text-slate-400 hover:text-red-500" aria-label="Delete">🗑️</button>
          </>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-1 flex-wrap my-1" style={{ marginLeft: depth * 16 + 24 }}>
          {LOCATION_ICON_CHOICES.map(c => (
            <button key={c} onClick={() => setIcon(c)}
              className={`w-7 h-7 rounded-lg text-base leading-none ${icon === c ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              {c}
            </button>
          ))}
          {icon && <button onClick={() => setIcon('')} className="text-xs text-slate-400 underline px-1">default</button>}
        </div>
      )}

      {moving && (
        <div className="flex items-center gap-2 my-1" style={{ marginLeft: depth * 16 + 24 }}>
          <span className="text-xs text-slate-500">Move under</span>
          <select defaultValue={node.parentId ?? ''} onChange={async e => { await onMove(node.id, e.target.value || undefined); setMoving(false) }}
            className="field flex-1 text-sm py-1">
            <option value="">Top level</option>
            {all.filter(l => !invalidParents.has(l.id)).map(l => (
              <option key={l.id} value={l.id}>{locationPath(l.id, all)}</option>
            ))}
          </select>
          <button onClick={() => setMoving(false)} className="text-slate-400 text-sm">✕</button>
        </div>
      )}

      {adding && (
        <div className="flex items-center gap-2 my-1" style={{ marginLeft: depth * 16 + 24 }}>
          <input autoFocus value={childName} onChange={e => setChildName(e.target.value)}
            onKeyDown={async e => { if (e.key === 'Enter' && childName.trim()) { await onAdd(node.id, childName.trim()); setChildName('') } }}
            placeholder="New place inside…" className="field flex-1 text-sm py-1" />
          <button onClick={async () => { if (childName.trim()) { await onAdd(node.id, childName.trim()); setChildName('') } }}
            disabled={!childName.trim()} className="bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">Add</button>
        </div>
      )}

      {expanded && kids.length > 0 && (
        <ul className="space-y-1 mt-1">
          {kids.map(k => (
            <Node key={k.id} node={k} all={all} depth={depth + 1}
              onAdd={onAdd} onRename={onRename} onMove={onMove} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function StoragePage() {
  const [all, setAll] = useState<StorageLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [newRoot, setNewRoot] = useState('')

  useEffect(() => { api.storageLocations.list().then(setAll).finally(() => setLoading(false)) }, [])

  async function addRoot() {
    const name = newRoot.trim()
    if (!name) return
    const loc = await api.storageLocations.create(name)
    setAll(p => [...p, loc]); setNewRoot('')
  }
  async function addChild(parentId: string, name: string) {
    const loc = await api.storageLocations.create(name, parentId)
    setAll(p => [...p, loc])
  }
  async function rename(id: string, name: string, icon?: string) {
    if (!name) return
    const cur = all.find(l => l.id === id)
    const u = await api.storageLocations.update(id, name, cur?.parentId, icon)
    setAll(p => p.map(l => l.id === id ? u : l))
  }
  async function move(id: string, parentId?: string) {
    const cur = all.find(l => l.id === id); if (!cur) return
    try {
      const u = await api.storageLocations.update(id, cur.name, parentId, cur.icon)
      setAll(p => p.map(l => l.id === id ? u : l))
    } catch { alert('Move not allowed (would create a cycle or exceed max depth).') }
  }
  async function del(loc: StorageLocation) {
    if (!confirm(`Delete "${loc.name}"? Anything stored here becomes unassigned.`)) return
    try { await api.storageLocations.delete(loc.id); setAll(p => p.filter(l => l.id !== loc.id)) }
    catch { alert('Empty or move the places inside this one first.') }
  }

  const roots = childrenOf(undefined, all)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Storage</h1>
        <Link href="/labels" className="ml-auto text-sm text-blue-500 font-medium">🖨️ Labels</Link>
      </div>

      <div className="flex gap-2 mb-6">
        <input value={newRoot} onChange={e => setNewRoot(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRoot()}
          placeholder="New place (e.g. Garage)" className="field flex-1" />
        <button onClick={addRoot} disabled={!newRoot.trim()}
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">Add</button>
      </div>

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}
      {!loading && roots.length === 0 && <p className="text-slate-400 dark:text-slate-500 text-sm">No places yet. Add one above.</p>}

      <ul className="space-y-1">
        {roots.map(r => (
          <Node key={r.id} node={r} all={all} depth={0}
            onAdd={addChild} onRename={rename} onMove={move} onDelete={del} />
        ))}
      </ul>
    </div>
  )
}
