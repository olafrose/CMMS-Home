'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import EntityCombobox from '@/components/EntityCombobox'
import StoragePicker from '@/components/StoragePicker'
import type { Asset, Tool, ToolCategory } from '@/lib/types'

// Breadcrumb segments; box/shelf link to their contents pages, location is plain text.
function storageSegments(tool: Tool): { label: string; href?: string }[] {
  if (tool.box) {
    const segs: { label: string; href?: string }[] = [{ label: tool.box.name, href: `/storage/box/${tool.boxId}` }]
    if (tool.box.shelf) {
      segs.push({ label: tool.box.shelf.name, href: `/storage/shelf/${tool.box.shelfId}` })
      segs.push({ label: tool.box.shelf.location.name })
    } else if (tool.box.location) {
      segs.push({ label: tool.box.location.name })
    }
    return segs
  }
  if (tool.shelf) {
    return [
      { label: tool.shelf.name, href: `/storage/shelf/${tool.shelfId}` },
      { label: tool.shelf.location.name },
    ]
  }
  if (tool.location) return [{ label: tool.location.name }]
  return [{ label: 'No location' }]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ToolDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tool, setTool] = useState<Tool | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [assetId, setAssetId] = useState('')
  const [toolCategoryId, setToolCategoryId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('')
  const [shelfId, setShelfId] = useState('')
  const [boxId, setBoxId] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [toolCategories, setToolCategories] = useState<ToolCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [borrower, setBorrower] = useState('')
  const [loanBusy, setLoanBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.tools.get(id), api.assets.list(), api.toolCategories.list()])
      .then(([t, asts, cats]) => {
        setTool(t); setAssets(asts); setToolCategories(cats)
        setName(t.name); setNotes(t.notes ?? '')
        setAssetId(t.assetId ?? '')
        setToolCategoryId(t.toolCategoryId ?? null)
        setLocationId(t.locationId ?? t.shelf?.locationId ?? t.box?.shelf?.locationId ?? t.box?.locationId ?? '')
        setShelfId(t.shelfId ?? t.box?.shelfId ?? '')
        setBoxId(t.boxId ?? '')
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    if (!tool) return
    setSaving(true)
    try {
      const updated = await api.tools.update(id, {
        name: name.trim(),
        notes: notes.trim() || undefined,
        assetId: assetId || undefined,
        toolCategoryId: toolCategoryId || undefined,
        boxId: boxId || undefined,
        shelfId: !boxId && shelfId ? shelfId : undefined,
        locationId: !boxId && !shelfId && locationId ? locationId : undefined,
      })
      setTool(updated); setEditing(false)
    } finally { setSaving(false) }
  }

  async function handleCheckout() {
    if (!borrower.trim()) return
    setLoanBusy(true)
    try {
      const updated = await api.tools.checkout(id, borrower.trim())
      setTool(updated); setBorrower('')
    } finally { setLoanBusy(false) }
  }

  async function handleReturn() {
    setLoanBusy(true)
    try {
      const updated = await api.tools.return(id)
      setTool(updated)
    } finally { setLoanBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${tool?.name}"? This will also remove its loan history.`)) return
    await api.tools.delete(id)
    router.push('/tools')
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!tool) return <div className="p-6 text-red-500 text-sm">Tool not found</div>

  const loan = tool.loans?.find(l => !l.returnedAt)
  const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-blue-500 text-sm">‹ Tools</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">{tool.name}</h1>
        <button onClick={() => setEditing(v => !v)} className="text-sm text-blue-500 font-medium">
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Loan card */}
      <div className={`${card} px-4 py-4`}>
        {loan ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Out on loan</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                {loan.borrower} <span className="text-slate-400 dark:text-slate-500">· since {formatDate(loan.loanedAt)}</span>
              </p>
            </div>
            <button onClick={handleReturn} disabled={loanBusy}
              className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
              {loanBusy ? '…' : 'Return'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="text" value={borrower} onChange={e => setBorrower(e.target.value)}
              placeholder="Lend to…" className="field flex-1"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCheckout() } }} />
            <button onClick={handleCheckout} disabled={loanBusy || !borrower.trim()}
              className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">
              {loanBusy ? '…' : 'Check out'}
            </button>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className={`${card} px-4 py-4 space-y-3`}>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <EntityCombobox
              items={toolCategories}
              value={toolCategoryId}
              onChange={setToolCategoryId}
              onCreate={async (name) => {
                const cat = await api.toolCategories.create(name)
                setToolCategories(prev => [...prev, cat])
                return cat
              }}
              placeholder="Search or create…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">For asset</label>
            <select value={assetId} onChange={e => setAssetId(e.target.value)} className="field">
              <option value="">— none —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="field" />
          </div>
          <StoragePicker
            value={{ locationId, shelfId, boxId }}
            onChange={(s) => { setLocationId(s.locationId); setShelfId(s.shelfId); setBoxId(s.boxId) }}
          />
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Storage + details */}
      {!editing && (
        <div className={`${card} px-4 py-3 space-y-2`}>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Stored at</p>
            <p className="text-sm">
              {storageSegments(tool).map((s, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-slate-300 dark:text-slate-600"> › </span>}
                  {s.href
                    ? <Link href={s.href} className="text-blue-600 dark:text-blue-400">{s.label}</Link>
                    : <span className="text-slate-700 dark:text-slate-200">{s.label}</span>}
                </span>
              ))}
            </p>
          </div>
          {tool.asset && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">For asset</p>
              <Link href={`/assets/${tool.assetId}`} className="text-sm text-blue-600 dark:text-blue-400">{tool.asset.name}</Link>
            </div>
          )}
          {tool.toolCategory && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Category</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{tool.toolCategory.name}</p>
            </div>
          )}
          {tool.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{tool.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <button onClick={handleDelete}
          className="w-full text-red-600 dark:text-red-400 font-medium py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          Delete Tool
        </button>
      </section>
    </div>
  )
}
