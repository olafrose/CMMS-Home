'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/lib/api'
import { targetFields } from '@/lib/maintenance'
import type { IntervalUnit, MaintenanceRule, MaintenanceStatus, MaintenanceTarget, ScheduleType } from '@/lib/types'

const INTERVAL_UNITS: IntervalUnit[] = ['Days', 'Weeks', 'Months', 'Years']
const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function toDateInput(iso?: string) { return iso ? new Date(iso).toISOString().slice(0, 10) : '' }

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

/**
 * The "Maintenance Schedule" section — list, add, edit, delete — for an item or a place.
 * The page owns `rules` (it loads them with the rest of its data); this owns the forms.
 */
export default function MaintenanceSchedule({ target, rules, setRules }: {
  target: MaintenanceTarget
  rules: MaintenanceRule[]
  setRules: Dispatch<SetStateAction<MaintenanceRule[]>>
}) {
  const { can } = useAuth()
  const [showAddForm, setShowAddForm] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const canWriteRules = can('rules.write')
  const canDeleteRules = can('rules.delete')

  async function handleAddRule(v: RuleFormValues) {
    setSavingAdd(true)
    try { const rule = await api.rules.create({ ...targetFields(target), ...v }); setRules((p) => [...p, rule]); setShowAddForm(false) }
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

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Maintenance Schedule</h2>
        {canWriteRules && (
          <button onClick={() => { setShowAddForm(v => !v); setEditingRuleId(null) }} className="text-sm text-blue-500 font-medium">{showAddForm ? 'Cancel' : '+ Add'}</button>
        )}
      </div>
      {showAddForm && <div className="mb-3"><RuleForm submitting={savingAdd} submitLabel="Save Schedule" onSubmit={handleAddRule} onCancel={() => setShowAddForm(false)} /></div>}
      {rules.length === 0 && !showAddForm && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {canWriteRules ? 'No schedule yet. Tap + Add to create one.' : 'No schedule yet.'}
        </p>
      )}
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
                    {canWriteRules && (
                      <button onClick={() => { setEditingRuleId(r.id); setShowAddForm(false) }} className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none" aria-label="Edit">✏️</button>
                    )}
                    {canDeleteRules && (
                      <button onClick={() => handleDeleteRule(r.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none" aria-label="Delete">🗑️</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
