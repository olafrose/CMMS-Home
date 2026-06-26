'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import type { Asset, IntervalUnit, MaintenanceEvent, MaintenanceRule, MaintenanceStatus, Part, ScheduleType } from '@/lib/types'

const INTERVAL_UNITS: IntervalUnit[] = ['Days', 'Weeks', 'Months', 'Years']

function spanLabel(value: number, unit: IntervalUnit): string {
  const u = unit.toLowerCase()
  return `${value} ${value === 1 ? u.replace(/s$/, '') : u}`
}

function intervalLabel(value: number, unit: IntervalUnit): string {
  return `Every ${spanLabel(value, unit)}`
}

function scheduleSummary(rule: MaintenanceRule): { primary: string; secondary: string } {
  if (rule.scheduleType === 'DueDate') {
    return {
      primary: rule.nextDueAt ? `Due ${formatDate(rule.nextDueAt)}` : 'No due date set',
      secondary: rule.dueWindowValue > 0 ? `within ${spanLabel(rule.dueWindowValue, rule.dueWindowUnit)}` : '',
    }
  }
  return {
    primary: intervalLabel(rule.intervalValue, rule.intervalUnit),
    secondary: rule.lastDoneAt ? `Last: ${formatDate(rule.lastDoneAt)}` : 'Never done',
  }
}

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

interface RuleFormValues {
  scheduleType: ScheduleType
  name?: string
  intervalValue: number
  intervalUnit: IntervalUnit
  lastDoneAt?: string
  nextDueAt?: string
  dueWindowValue: number
  dueWindowUnit: IntervalUnit
  reminderLeadValue: number
  reminderLeadUnit: IntervalUnit
}

function RuleForm({ initial, submitting, submitLabel, onSubmit, onCancel }: {
  initial?: MaintenanceRule
  submitting: boolean
  submitLabel: string
  onSubmit: (v: RuleFormValues) => void
  onCancel: () => void
}) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initial?.scheduleType ?? 'Interval')
  const [name, setName] = useState(initial?.name ?? '')
  const [intervalValue, setIntervalValue] = useState(initial?.intervalValue ? String(initial.intervalValue) : '')
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.intervalUnit ?? 'Months')
  const [lastDone, setLastDone] = useState(toDateInput(initial?.lastDoneAt))
  const [nextDue, setNextDue] = useState(toDateInput(initial?.nextDueAt))
  const [windowValue, setWindowValue] = useState(initial ? String(initial.dueWindowValue) : '0')
  const [windowUnit, setWindowUnit] = useState<IntervalUnit>(initial?.dueWindowUnit ?? 'Months')
  const [reminderValue, setReminderValue] = useState(initial ? String(initial.reminderLeadValue) : '30')
  const [reminderUnit, setReminderUnit] = useState<IntervalUnit>(initial?.reminderLeadUnit ?? 'Days')

  const valid = scheduleType === 'Interval' ? parseInt(intervalValue) >= 1 : !!nextDue

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      scheduleType,
      name: name.trim() || undefined,
      intervalValue: parseInt(intervalValue) || 0,
      intervalUnit,
      lastDoneAt: scheduleType === 'Interval' && lastDone ? new Date(lastDone).toISOString() : undefined,
      nextDueAt: scheduleType === 'DueDate' && nextDue ? new Date(nextDue).toISOString() : undefined,
      dueWindowValue: parseInt(windowValue) || 0,
      dueWindowUnit: windowUnit,
      reminderLeadValue: parseInt(reminderValue) || 0,
      reminderLeadUnit: reminderUnit,
    })
  }

  return (
    <form onSubmit={submit} className={`${card} border-blue-200 dark:border-blue-800 px-4 py-4 space-y-3`}>
      <div className="grid grid-cols-2 gap-2">
        {(['Interval', 'DueDate'] as ScheduleType[]).map((t) => (
          <button key={t} type="button" onClick={() => setScheduleType(t)}
            className={`py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
              scheduleType === t
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
            {t === 'Interval' ? 'Repeating' : 'Due date'}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name (optional)</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Replace filter" className="field" />
      </div>

      {scheduleType === 'Interval' ? (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Repeat every *</label>
            <div className="flex gap-2">
              <input type="number" min="1" value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} placeholder="e.g. 3" className="field w-24 flex-shrink-0" />
              <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)} className="field">
                {INTERVAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Last done (optional)</label>
            <input type="date" value={lastDone} onChange={(e) => setLastDone(e.target.value)} className="field" />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Next due *</label>
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className="field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Due window (optional)</label>
            <div className="flex gap-2">
              <input type="number" min="0" value={windowValue} onChange={(e) => setWindowValue(e.target.value)} className="field w-24 flex-shrink-0" />
              <select value={windowUnit} onChange={(e) => setWindowUnit(e.target.value as IntervalUnit)} className="field">
                {INTERVAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">0 = due on the exact day. e.g. 1 Month for a TÜV due “within” a month.</p>
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Remind me before due</label>
        <div className="flex gap-2">
          <input type="number" min="0" value={reminderValue} onChange={(e) => setReminderValue(e.target.value)} className="field w-24 flex-shrink-0" />
          <select value={reminderUnit} onChange={(e) => setReminderUnit(e.target.value as IntervalUnit)} className="field">
            {INTERVAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={submitting || !valid}
          className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded-lg">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  // Rule forms
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
    Promise.all([api.assets.get(id), api.events.list(id), api.rules.list(id)])
      .then(([a, e, r]) => { setAsset(a); setEvents(e); setRules(r) })
      .finally(() => setLoading(false))
    api.parts.list({ assetId: id }).then(setParts).catch(() => {})
  }, [id])

  async function handleAddRule(v: RuleFormValues) {
    setSavingAdd(true)
    try {
      const rule = await api.rules.create({ assetId: id, ...v })
      setRules((prev) => [...prev, rule])
      setShowAddForm(false)
    } finally {
      setSavingAdd(false)
    }
  }

  async function handleSaveEdit(ruleId: string, v: RuleFormValues) {
    setSavingEdit(true)
    try {
      const updated = await api.rules.update(ruleId, v)
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

  const logUrl = `${process.env.NEXT_PUBLIC_QR_BASE_URL || origin}/assets/${id}/log`

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/assets" className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">{asset.name}</h1>
        <Link href={`/assets/${id}/edit`} className="text-sm text-blue-500 font-medium">Edit</Link>
      </div>

      {/* Info card */}
      <div className={`${card} px-4 py-4 space-y-1`}>
        {asset.category && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Category:</span> {asset.category.name}</p>}
        {asset.location && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Location:</span> {asset.location.name}</p>}
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

        {showAddForm && (
          <div className="mb-3">
            <RuleForm submitting={savingAdd} submitLabel="Save Schedule"
              onSubmit={handleAddRule} onCancel={() => setShowAddForm(false)} />
          </div>
        )}

        {rules.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-400 dark:text-slate-500">No schedule yet. Tap + Add to create one.</p>
        )}

        <ul className="space-y-2">
          {rules.map((r) => {
            const summary = scheduleSummary(r)
            return (
              <li key={r.id}>
                {editingId === r.id ? (
                  <RuleForm initial={r} submitting={savingEdit} submitLabel="Save"
                    onSubmit={(v) => handleSaveEdit(r.id, v)} onCancel={() => setEditingId(null)} />
                ) : (
                  <div className={`flex items-center justify-between ${card} px-4 py-3`}>
                    <div>
                      {r.name && <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.name}</p>}
                      <p className={r.name ? 'text-xs text-slate-500 dark:text-slate-400' : 'text-sm font-medium text-slate-700 dark:text-slate-200'}>{summary.primary}</p>
                      {summary.secondary && <p className="text-xs text-slate-400 dark:text-slate-500">{summary.secondary}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[r.status]}`}>
                        {r.status}
                      </span>
                      <button onClick={() => { setEditingId(r.id); setShowAddForm(false) }}
                        className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none"
                        aria-label="Edit">✏️</button>
                      <button onClick={() => handleDeleteRule(r.id)}
                        className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none"
                        aria-label="Delete">🗑️</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
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
              <li key={e.id}>
                <Link href={`/events/${e.id}?asset_id=${id}`} className={`flex items-start gap-3 ${card} px-4 py-3`}>
                  <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${eventTypeColor[e.type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {e.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    {e.note && <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{e.note}</p>}
                    <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(e.createdAt)}</p>
                  </div>
                  <span className="text-slate-300 dark:text-slate-600 text-lg self-center">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Parts for this asset */}
      {parts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Parts ({parts.length})
          </h2>
          <ul className="space-y-2">
            {parts.map((p) => {
              const lowStock = p.minQuantity != null && p.quantity <= p.minQuantity
              return (
                <li key={p.id}>
                  <Link href={`/parts/${p.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                      {p.partCategory && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{p.partCategory.name}</p>}
                    </div>
                    <span className={`text-sm font-semibold ${lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {p.quantity} {p.unit}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

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
