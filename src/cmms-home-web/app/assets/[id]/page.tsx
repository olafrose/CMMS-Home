'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import type { Asset, MaintenanceEvent, MaintenanceRule, MaintenanceStatus } from '@/lib/types'

const statusColor: Record<MaintenanceStatus, string> = {
  Overdue: 'bg-red-100 text-red-700',
  Upcoming: 'bg-amber-100 text-amber-700',
  Due: 'bg-orange-100 text-orange-700',
  Ok: 'bg-green-100 text-green-700',
}

const eventTypeColor: Record<string, string> = {
  maintenance: 'bg-blue-100 text-blue-700',
  repair: 'bg-red-100 text-red-700',
  cleaning: 'bg-teal-100 text-teal-700',
  replacement: 'bg-purple-100 text-purple-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  // Add-rule form state
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [intervalDays, setIntervalDays] = useState('')
  const [lastDoneAt, setLastDoneAt] = useState('')
  const [savingRule, setSavingRule] = useState(false)

  // Delete state
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
    Promise.all([api.assets.get(id), api.events.list(id), api.rules.list(id)])
      .then(([a, e, r]) => { setAsset(a); setEvents(e); setRules(r) })
      .finally(() => setLoading(false))
  }, [id])

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault()
    const days = parseInt(intervalDays)
    if (!days || days < 1) return
    setSavingRule(true)
    try {
      const rule = await api.rules.create({
        assetId: id,
        intervalDays: days,
        lastDoneAt: lastDoneAt ? new Date(lastDoneAt).toISOString() : undefined,
      })
      setRules((prev) => [...prev, rule])
      setIntervalDays('')
      setLastDoneAt('')
      setShowRuleForm(false)
    } finally {
      setSavingRule(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${asset?.name}" and all its history? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.assets.delete(id)
      router.push('/assets')
    } catch {
      setDeleting(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (!asset) return <div className="p-6 text-red-600 text-sm">Asset not found</div>

  const logUrl = `${origin}/assets/${id}/log`

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/assets" className="text-blue-600 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 truncate">{asset.name}</h1>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl px-4 py-4 shadow-sm border border-slate-100 space-y-1">
        {asset.category && <p className="text-sm text-slate-500"><span className="font-medium">Category:</span> {asset.category}</p>}
        {asset.location && <p className="text-sm text-slate-500"><span className="font-medium">Location:</span> {asset.location}</p>}
        <p className="text-sm text-slate-400">Added {formatDate(asset.createdAt)}</p>
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
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Maintenance Schedule</h2>
          <button
            onClick={() => setShowRuleForm((v) => !v)}
            className="text-sm text-blue-600 font-medium"
          >
            {showRuleForm ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showRuleForm && (
          <form onSubmit={handleAddRule} className="bg-white rounded-xl px-4 py-4 shadow-sm border border-blue-100 space-y-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Repeat every (days) *</label>
              <input
                type="number"
                min="1"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                placeholder="e.g. 90"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Last done (optional)</label>
              <input
                type="date"
                value={lastDoneAt}
                onChange={(e) => setLastDoneAt(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={savingRule || !intervalDays}
              className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50"
            >
              {savingRule ? 'Saving…' : 'Save Schedule'}
            </button>
          </form>
        )}

        {rules.length === 0 && !showRuleForm && (
          <p className="text-sm text-slate-400">No schedule yet. Tap + Add to create one.</p>
        )}

        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100">
              <div>
                <p className="text-sm font-medium text-slate-700">Every {r.intervalDays} days</p>
                {r.lastDoneAt && <p className="text-xs text-slate-400">Last: {formatDate(r.lastDoneAt)}</p>}
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[r.status]}`}>
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* QR Code */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">QR Code</h2>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col items-center gap-2">
          {origin && <QRCodeSVG value={logUrl} size={160} />}
          <p className="text-xs text-slate-400 text-center">Scan to log maintenance</p>
        </div>
      </section>

      {/* Event timeline */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          History ({events.length})
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100">
                <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${eventTypeColor[e.type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {e.type}
                </span>
                <div className="flex-1 min-w-0">
                  {e.note && <p className="text-sm text-slate-700 truncate">{e.note}</p>}
                  <p className="text-xs text-slate-400">{formatDate(e.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Delete */}
      <section className="pt-2 border-t border-slate-200">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full text-red-600 font-medium py-3 rounded-xl border border-red-200 bg-red-50 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete Asset'}
        </button>
      </section>
    </div>
  )
}
