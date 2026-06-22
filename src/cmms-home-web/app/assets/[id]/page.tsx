'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import type { Asset, MaintenanceEvent, MaintenanceRule, MaintenanceStatus } from '@/lib/types'

const statusColor: Record<MaintenanceStatus, string> = {
  Overdue: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  Upcoming: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  Due: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  Ok: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
}

const eventTypeColor: Record<string, string> = {
  maintenance: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  repair: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  cleaning: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  replacement: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function toDateInput(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  // Add-rule form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addDays, setAddDays] = useState('')
  const [addLastDone, setAddLastDone] = useState('')
  const [savingAdd, setSavingAdd] = useState(false)

  // Edit-rule form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDays, setEditDays] = useState('')
  const [editLastDone, setEditLastDone] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
    Promise.all([api.assets.get(id), api.events.list(id), api.rules.list(id)])
      .then(([a, e, r]) => { setAsset(a); setEvents(e); setRules(r) })
      .finally(() => setLoading(false))
  }, [id])

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault()
    const days = parseInt(addDays)
    if (!days || days < 1) return
    setSavingAdd(true)
    try {
      const rule = await api.rules.create({
        assetId: id,
        name: addName || undefined,
        intervalDays: days,
        lastDoneAt: addLastDone ? new Date(addLastDone).toISOString() : undefined,
      })
      setRules((prev) => [...prev, rule])
      setAddName('')
      setAddDays('')
      setAddLastDone('')
      setShowAddForm(false)
    } finally {
      setSavingAdd(false)
    }
  }

  function startEdit(rule: MaintenanceRule) {
    setEditingId(rule.id)
    setEditName(rule.name ?? '')
    setEditDays(String(rule.intervalDays))
    setEditLastDone(toDateInput(rule.lastDoneAt))
  }

  async function handleSaveEdit(e: React.FormEvent, ruleId: string) {
    e.preventDefault()
    const days = parseInt(editDays)
    if (!days || days < 1) return
    setSavingEdit(true)
    try {
      const updated = await api.rules.update(ruleId, {
        name: editName || undefined,
        intervalDays: days,
        lastDoneAt: editLastDone ? new Date(editLastDone).toISOString() : undefined,
      })
      setRules((prev) => prev.map((r) => r.id === ruleId ? updated : r))
      setEditingId(null)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteRule(ruleId: string) {
    await api.rules.delete(ruleId)
    setRules((prev) => prev.filter((r) => r.id !== ruleId))
  }

  async function handleDeleteAsset() {
    if (!window.confirm(`Delete "${asset?.name}" and all its history? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.assets.delete(id)
      router.push('/assets')
    } catch {
      setDeleting(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!asset) return <div className="p-6 text-red-500 text-sm">Asset not found</div>

  const logUrl = `${origin}/assets/${id}/log`

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/assets" className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">{asset.name}</h1>
      </div>

      {/* Info card */}
      <div className={`${card} px-4 py-4 space-y-1`}>
        {asset.category && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Category:</span> {asset.category}</p>}
        {asset.location && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Location:</span> {asset.location}</p>}
        <p className="text-sm text-slate-400 dark:text-slate-500">Added {formatDate(asset.createdAt)}</p>
      </div>

      {/* Quick log CTA */}
      <Link
        href={`/assets/${id}/log`}
        className="block w-full bg-blue-600 text-white text-center font-semibold py-4 rounded-xl shadow text-lg"
      >
        + Log Maintenance
      </Link>

      {/* Maintenance schedule */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Maintenance Schedule</h2>
          <button onClick={() => { setShowAddForm((v) => !v); setEditingId(null) }} className="text-sm text-blue-500 font-medium">
            {showAddForm ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAddRule} className={`${card} border-blue-200 dark:border-blue-800 px-4 py-4 space-y-3 mb-3`}>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name (optional)</label>
              <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Replace filter" className="field" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Repeat every (days) *</label>
              <input type="number" min="1" value={addDays} onChange={(e) => setAddDays(e.target.value)}
                placeholder="e.g. 90" className="field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Last done (optional)</label>
              <input type="date" value={addLastDone} onChange={(e) => setAddLastDone(e.target.value)} className="field" />
            </div>
            <button type="submit" disabled={savingAdd || !addDays}
              className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
              {savingAdd ? 'Saving…' : 'Save Schedule'}
            </button>
          </form>
        )}

        {rules.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-400 dark:text-slate-500">No schedule yet. Tap + Add to create one.</p>
        )}

        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id}>
              {editingId === r.id ? (
                /* Inline edit form */
                <form onSubmit={(e) => handleSaveEdit(e, r.id)}
                  className={`${card} border-blue-200 dark:border-blue-800 px-4 py-4 space-y-3`}>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name (optional)</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Replace filter" className="field" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Repeat every (days) *</label>
                    <input type="number" min="1" value={editDays} onChange={(e) => setEditDays(e.target.value)}
                      className="field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Last done</label>
                    <input type="date" value={editLastDone} onChange={(e) => setEditLastDone(e.target.value)} className="field" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingEdit || !editDays}
                      className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}
                      className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded-lg">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* Rule row */
                <div className={`flex items-center justify-between ${card} px-4 py-3`}>
                  <div>
                    {r.name && <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.name}</p>}
                    <p className={r.name ? 'text-xs text-slate-500 dark:text-slate-400' : 'text-sm font-medium text-slate-700 dark:text-slate-200'}>Every {r.intervalDays} days</p>
                    {r.lastDoneAt
                      ? <p className="text-xs text-slate-400 dark:text-slate-500">Last: {formatDate(r.lastDoneAt)}</p>
                      : <p className="text-xs text-slate-400 dark:text-slate-500">Never done</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[r.status]}`}>
                      {r.status}
                    </span>
                    <button onClick={() => startEdit(r)}
                      className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none"
                      aria-label="Edit">✏️</button>
                    <button onClick={() => handleDeleteRule(r.id)}
                      className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none"
                      aria-label="Delete">🗑️</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* QR Code */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">QR Code</h2>
        <div className={`${card} p-5 flex flex-col items-center gap-2`}>
          {origin && <QRCodeSVG value={logUrl} size={160} bgColor="transparent" fgColor="currentColor"
            className="text-slate-900 dark:text-slate-100" />}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to log maintenance</p>
        </div>
      </section>

      {/* Event timeline */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          History ({events.length})
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className={`flex items-start gap-3 ${card} px-4 py-3`}>
                <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${eventTypeColor[e.type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {e.type}
                </span>
                <div className="flex-1 min-w-0">
                  {e.note && <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{e.note}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(e.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Delete asset */}
      <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <button onClick={handleDeleteAsset} disabled={deleting}
          className="w-full text-red-600 dark:text-red-400 font-medium py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 disabled:opacity-50">
          {deleting ? 'Deleting…' : 'Delete Asset'}
        </button>
      </section>
    </div>
  )
}
