'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import EntityCombobox from '@/components/EntityCombobox'
import StorageLocationPicker from '@/components/StorageLocationPicker'
import { DocumentPreviewButton } from '@/components/DocumentPreview'
import { locationPath } from '@/lib/storage'
import { api } from '@/lib/api'
import type {
  Category, Document, Equipment, EquipmentKind, IntervalUnit, MaintenanceEvent, MaintenanceRule,
  MaintenanceStatus, Part, ScheduleType, StorageLocation,
} from '@/lib/types'

const INTERVAL_UNITS: IntervalUnit[] = ['Days', 'Weeks', 'Months', 'Years']
const KINDS: EquipmentKind[] = ['Asset', 'Tool', 'Both']
const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function spanLabel(value: number, unit: IntervalUnit): string {
  const u = unit.toLowerCase()
  return `${value} ${value === 1 ? u.replace(/s$/, '') : u}`
}
function scheduleSummary(rule: MaintenanceRule): { primary: string; secondary: string } {
  if (rule.scheduleType === 'DueDate') {
    return {
      primary: rule.nextDueAt ? `Due ${formatDate(rule.nextDueAt)}` : 'No due date set',
      secondary: rule.dueWindowValue > 0 ? `within ${spanLabel(rule.dueWindowValue, rule.dueWindowUnit)}` : '',
    }
  }
  return {
    primary: `Every ${spanLabel(rule.intervalValue, rule.intervalUnit)}`,
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
function toDateInput(iso?: string) { return iso ? new Date(iso).toISOString().slice(0, 10) : '' }

interface RuleFormValues {
  scheduleType: ScheduleType; name?: string; intervalValue: number; intervalUnit: IntervalUnit
  lastDoneAt?: string; nextDueAt?: string; dueWindowValue: number; dueWindowUnit: IntervalUnit
  reminderLeadValue: number; reminderLeadUnit: IntervalUnit
}

function RuleForm({ initial, submitting, submitLabel, onSubmit, onCancel }: {
  initial?: MaintenanceRule; submitting: boolean; submitLabel: string
  onSubmit: (v: RuleFormValues) => void; onCancel: () => void
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
      scheduleType, name: name.trim() || undefined,
      intervalValue: parseInt(intervalValue) || 0, intervalUnit,
      lastDoneAt: scheduleType === 'Interval' && lastDone ? new Date(lastDone).toISOString() : undefined,
      nextDueAt: scheduleType === 'DueDate' && nextDue ? new Date(nextDue).toISOString() : undefined,
      dueWindowValue: parseInt(windowValue) || 0, dueWindowUnit: windowUnit,
      reminderLeadValue: parseInt(reminderValue) || 0, reminderLeadUnit: reminderUnit,
    })
  }

  return (
    <form onSubmit={submit} className={`${card} border-blue-200 dark:border-blue-800 px-4 py-4 space-y-3`}>
      <div className="grid grid-cols-2 gap-2">
        {(['Interval', 'DueDate'] as ScheduleType[]).map((t) => (
          <button key={t} type="button" onClick={() => setScheduleType(t)}
            className={`py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
              scheduleType === t ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
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
        <button type="submit" disabled={submitting || !valid} className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded-lg">Cancel</button>
      </div>
    </form>
  )
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [item, setItem] = useState<Equipment | null>(null)
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  // Edit form
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<EquipmentKind>('Asset')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [storageLocationId, setStorageLocationId] = useState<string | null>(null)
  const [usedOnId, setUsedOnId] = useState('')
  const [notes, setNotes] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  // Loan
  const [borrower, setBorrower] = useState('')
  const [loanBusy, setLoanBusy] = useState(false)

  // Rule forms
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function seed(e: Equipment) {
    setName(e.name); setKind(e.kind); setCategoryId(e.categoryId ?? null)
    setStorageLocationId(e.storageLocationId ?? null); setUsedOnId(e.usedOnEquipmentId ?? ''); setNotes(e.notes ?? '')
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    Promise.all([api.equipment.get(id), api.events.list(id), api.rules.list(id),
      api.equipment.list(), api.categories.list(), api.storageLocations.list()])
      .then(([e, ev, r, all, cats, locs]) => {
        setItem(e); setEvents(ev); setRules(r); setAllEquipment(all); setCategories(cats); setLocations(locs); seed(e)
      })
      .finally(() => setLoading(false))
    api.parts.list({ equipmentId: id }).then(setParts).catch(() => {})
    api.documents.list({ equipmentId: id }).then(setDocuments).catch(() => {})
  }, [id])

  async function saveItem() {
    setSavingItem(true)
    try {
      const updated = await api.equipment.update(id, {
        name: name.trim(), kind,
        categoryId: categoryId || undefined,
        storageLocationId: storageLocationId || undefined,
        usedOnEquipmentId: usedOnId || undefined,
        notes: notes.trim() || undefined,
        imageUrl: item?.imageUrl,
      })
      setItem(updated); setEditing(false)
    } finally { setSavingItem(false) }
  }

  async function checkout() {
    if (!borrower.trim()) return
    setLoanBusy(true)
    try { setItem(await api.equipment.checkout(id, borrower.trim())); setBorrower('') }
    finally { setLoanBusy(false) }
  }
  async function doReturn() {
    setLoanBusy(true)
    try { setItem(await api.equipment.return(id)) } finally { setLoanBusy(false) }
  }

  async function handleAddRule(v: RuleFormValues) {
    setSavingAdd(true)
    try { const rule = await api.rules.create({ equipmentId: id, ...v }); setRules((p) => [...p, rule]); setShowAddForm(false) }
    finally { setSavingAdd(false) }
  }
  async function handleSaveEdit(ruleId: string, v: RuleFormValues) {
    setSavingEdit(true)
    try { const u = await api.rules.update(ruleId, v); setRules((p) => p.map((r) => r.id === ruleId ? u : r)); setEditingRuleId(null) }
    finally { setSavingEdit(false) }
  }
  async function handleDeleteRule(ruleId: string) {
    await api.rules.delete(ruleId); setRules((p) => p.filter((r) => r.id !== ruleId))
  }
  async function handleDelete() {
    if (!window.confirm(`Delete "${item?.name}" and all its history? This cannot be undone.`)) return
    setDeleting(true)
    try { await api.equipment.delete(id); router.push(kind === 'Tool' ? '/tools' : '/assets') } catch { setDeleting(false) }
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!item) return <div className="p-6 text-red-500 text-sm">Not found</div>

  const logUrl = `${process.env.NEXT_PUBLIC_QR_BASE_URL || origin}/equipment/${id}/log`
  const loan = item.loans?.find(l => !l.returnedAt)
  const backHref = item.kind === 'Tool' ? '/tools' : '/assets'
  const relatedParts = parts
  const relatedEquipment = allEquipment.filter(e => e.usedOnEquipmentId === id)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">{item.name}</h1>
        <button onClick={() => { setEditing(v => !v); seed(item) }} className="text-sm text-blue-500 font-medium">{editing ? 'Cancel' : 'Edit'}</button>
      </div>

      {editing ? (
        <div className={`${card} px-4 py-4 space-y-3`}>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Shows in</label>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(k => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`py-2 rounded-lg text-sm font-semibold border-2 ${kind === k
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {k === 'Asset' ? 'Assets' : k === 'Tool' ? 'Tools' : 'Both'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <EntityCombobox items={categories} value={categoryId} onChange={setCategoryId}
              onCreate={async (n) => { const c = await api.categories.create(n); setCategories(p => [...p, c]); return c }}
              placeholder="Search or create…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stored at</label>
            <StorageLocationPicker value={storageLocationId} onChange={setStorageLocationId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Used on (optional)</label>
            <select value={usedOnId} onChange={e => setUsedOnId(e.target.value)} className="field">
              <option value="">— none —</option>
              {allEquipment.filter(e => e.id !== id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="field" />
          </div>
          <button onClick={saveItem} disabled={savingItem} className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50">
            {savingItem ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      ) : (
        <div className={`${card} px-4 py-4 space-y-1`}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">Shows in:</span>{' '}
            {item.kind === 'Both' ? 'Assets & Tools' : item.kind === 'Tool' ? 'Tools' : 'Assets'}
          </p>
          {item.category && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Category:</span> {item.category.name}</p>}
          {item.storageLocationId && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Stored at:</span> {locationPath(item.storageLocationId, locations)}</p>}
          {item.usedOnEquipment && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Used on:</span> <Link href={`/equipment/${item.usedOnEquipmentId}`} className="text-blue-600 dark:text-blue-400">{item.usedOnEquipment.name}</Link></p>}
          {item.notes && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap pt-1">{item.notes}</p>}
          <p className="text-sm text-slate-400 dark:text-slate-500 pt-1">Added {formatDate(item.createdAt)}</p>
        </div>
      )}

      {/* Lending */}
      <div className={`${card} px-4 py-4`}>
        {loan ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Out on loan</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{loan.borrower} <span className="text-slate-400 dark:text-slate-500">· since {formatDate(loan.loanedAt)}</span></p>
            </div>
            <button onClick={doReturn} disabled={loanBusy} className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">{loanBusy ? '…' : 'Return'}</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="text" value={borrower} onChange={e => setBorrower(e.target.value)} placeholder="Lend to…" className="field flex-1"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkout() } }} />
            <button onClick={checkout} disabled={loanBusy || !borrower.trim()} className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">{loanBusy ? '…' : 'Check out'}</button>
          </div>
        )}
      </div>

      {/* Quick log CTA */}
      <Link href={`/equipment/${id}/log`} className="block w-full bg-blue-600 text-white text-center font-semibold py-4 rounded-xl shadow text-lg">+ Log Maintenance</Link>

      {/* Maintenance schedule */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Maintenance Schedule</h2>
          <button onClick={() => { setShowAddForm(v => !v); setEditingRuleId(null) }} className="text-sm text-blue-500 font-medium">{showAddForm ? 'Cancel' : '+ Add'}</button>
        </div>
        {showAddForm && <div className="mb-3"><RuleForm submitting={savingAdd} submitLabel="Save Schedule" onSubmit={handleAddRule} onCancel={() => setShowAddForm(false)} /></div>}
        {rules.length === 0 && !showAddForm && <p className="text-sm text-slate-400 dark:text-slate-500">No schedule yet. Tap + Add to create one.</p>}
        <ul className="space-y-2">
          {rules.map((r) => {
            const summary = scheduleSummary(r)
            return (
              <li key={r.id}>
                {editingRuleId === r.id ? (
                  <RuleForm initial={r} submitting={savingEdit} submitLabel="Save" onSubmit={(v) => handleSaveEdit(r.id, v)} onCancel={() => setEditingRuleId(null)} />
                ) : (
                  <div className={`flex items-center justify-between ${card} px-4 py-3`}>
                    <div>
                      {r.name && <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.name}</p>}
                      <p className={r.name ? 'text-xs text-slate-500 dark:text-slate-400' : 'text-sm font-medium text-slate-700 dark:text-slate-200'}>{summary.primary}</p>
                      {summary.secondary && <p className="text-xs text-slate-400 dark:text-slate-500">{summary.secondary}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[r.status]}`}>{r.status}</span>
                      <button onClick={() => { setEditingRuleId(r.id); setShowAddForm(false) }} className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none" aria-label="Edit">✏️</button>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none" aria-label="Delete">🗑️</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* QR */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">QR Code</h2>
        <div className={`${card} p-5 flex flex-col items-center gap-2`}>
          {origin && <QRCodeSVG value={logUrl} size={160} bgColor="transparent" fgColor="currentColor" className="text-slate-900 dark:text-slate-100" />}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to log maintenance</p>
        </div>
      </section>

      {/* History */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">History ({events.length})</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}?equipment_id=${id}`} className={`flex items-start gap-3 ${card} px-4 py-3`}>
                  <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${eventTypeColor[e.type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{e.type}</span>
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

      {/* Related tools & parts */}
      {(relatedParts.length > 0 || relatedEquipment.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Related tools &amp; parts</h2>
          <ul className="space-y-2">
            {relatedEquipment.map((e) => (
              <li key={e.id}>
                <Link href={`/equipment/${e.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                  <span className="text-lg leading-none">🛠️</span>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{e.name}</span>
                  <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
                </Link>
              </li>
            ))}
            {relatedParts.map((p) => {
              const lowStock = p.minQuantity != null && p.quantity <= p.minQuantity
              return (
                <li key={p.id}>
                  <Link href={`/parts/${p.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                    <span className="text-lg leading-none">🔩</span>
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{p.name}</span>
                    <span className={`text-sm font-semibold ${lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>{p.quantity} {p.unit}</span>
                    <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Documents linked to this equipment */}
      {documents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Documents ({documents.length})</h2>
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                <span className="text-lg leading-none">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{d.title ?? d.fileName}</p>
                  {d.category && <p className="text-xs text-slate-400 dark:text-slate-500">{d.category.name}</p>}
                </div>
                <DocumentPreviewButton doc={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Delete */}
      <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <button onClick={handleDelete} disabled={deleting} className="w-full text-red-600 dark:text-red-400 font-medium py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 disabled:opacity-50">
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </section>
    </div>
  )
}
