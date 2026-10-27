'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { api, ApiError } from '@/lib/api'
import { formatMeterValue } from '@/lib/meters'
import type { Meter, MeterReading } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function message(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback
  const validation = Object.values(e.errors ?? {}).flat()
  return validation.length ? validation.join(' ') : e.detail || fallback
}

/**
 * The "Meters" section of an item: running-hour, mileage or cycle counters, their current
 * values, and recording a reading by hand. Integrations push readings through the API; this
 * is for the hour meter someone reads off the device.
 *
 * The page owns `meters`, because the schedule section needs them too (a usage schedule
 * picks one). `onChanged` lets the page reload schedules after a reading moves a counter,
 * since their status is computed from it.
 */
export default function MeterList({ equipmentId, meters, setMeters, onChanged }: {
  equipmentId: string
  meters: Meter[]
  setMeters: Dispatch<SetStateAction<Meter[]>>
  onChanged: () => void
}) {
  const { can } = useAuth()
  const canRecord = can('meters.record')
  const canWrite = can('meters.write')

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('Operating hours')
  const [newUnit, setNewUnit] = useState('h')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setBusy(true); setError('')
    try {
      const meter = await api.meters.create({ equipmentId, name: newName.trim(), unit: newUnit.trim() })
      setMeters(prev => [...prev, meter])
      setAdding(false)
    } catch (e) {
      setError(message(e, 'Could not add the meter.'))
    } finally { setBusy(false) }
  }

  function replaceMeter(updated: Meter) {
    setMeters(prev => prev.map(m => m.id === updated.id ? updated : m))
    onChanged()
  }

  if (meters.length === 0 && !canWrite) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Meters</h2>
        {canWrite && (
          <button onClick={() => { setAdding(v => !v); setError('') }} className="text-sm text-blue-500 font-medium">
            {adding ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {adding && (
        <div className={`${card} border-blue-200 dark:border-blue-800 px-4 py-3 space-y-2 mb-3`}>
          <div className="flex gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" className="field" />
            <input type="text" value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="Unit" className="field w-24 flex-shrink-0" />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            A running total, e.g. operating hours (h), mileage (km) or wash cycles. Usage schedules count against it.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={add} disabled={busy || !newName.trim() || !newUnit.trim()}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
            {busy ? 'Adding…' : 'Add Meter'}
          </button>
        </div>
      )}

      {meters.length === 0 && !adding && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No meters. Add one to schedule service by running hours, mileage or cycles.
        </p>
      )}

      <ul className="space-y-2">
        {meters.map(m => (
          <MeterRow key={m.id} meter={m} canRecord={canRecord} canWrite={canWrite}
            onUpdated={replaceMeter}
            onDeleted={() => { setMeters(prev => prev.filter(x => x.id !== m.id)); onChanged() }} />
        ))}
      </ul>
    </section>
  )
}

function MeterRow({ meter, canRecord, canWrite, onUpdated, onDeleted }: {
  meter: Meter; canRecord: boolean; canWrite: boolean
  onUpdated: (m: Meter) => void; onDeleted: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<MeterReading[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  async function run<T>(fn: () => Promise<T>, fallback: string): Promise<T | undefined> {
    setBusy(true); setError('')
    try { return await fn() } catch (e) { setError(message(e, fallback)) } finally { setBusy(false) }
  }

  async function loadHistory() {
    setHistory(await api.meters.readings(meter.id, 20).catch(() => []))
  }

  // Entered as the total the user reads on the device; the API takes the raw counter, so
  // the meter's offset (from an earlier counter reset) is taken off here.
  async function record() {
    const total = Number(value)
    if (!Number.isFinite(total)) return
    const result = await run(() => api.meters.record(meter.id, total - meter.offset), 'Could not record that reading.')
    if (result) { onUpdated(result.meter); setValue(''); if (showHistory) void loadHistory() }
  }

  async function rebase() {
    const raw = prompt(
      `Counter reset on the same device?\n\nEnter what the device shows now. The total continues from `
      + `${formatMeterValue(meter.currentValue ?? 0, meter.unit)}, so schedules are unaffected.`, '0')
    if (raw === null || !Number.isFinite(Number(raw))) return
    const result = await run(() => api.meters.rebase(meter.id, Number(raw)), 'Could not reset the counter.')
    if (result) onUpdated(result.meter)
  }

  async function replace() {
    if (!confirm(
      `Device replaced?\n\n"${meter.name}" starts over at 0, and every schedule counting against it starts fresh `
      + `from now. Earlier readings stay as history.`)) return
    const result = await run(() => api.meters.replace(meter.id, 0), 'Could not mark the device replaced.')
    if (result) { onUpdated(result.meter); if (showHistory) void loadHistory() }
  }

  async function remove() {
    if (!confirm(`Delete "${meter.name}" and all its readings?`)) return
    const ok = await run(() => api.meters.delete(meter.id).then(() => true), 'Could not delete the meter.')
    if (ok) onDeleted()
  }

  async function removeReading(r: MeterReading) {
    if (!confirm(`Delete the reading of ${formatMeterValue(r.value, meter.unit)} from ${formatDateTime(r.readAt)}?`)) return
    const ok = await run(() => api.meters.deleteReading(meter.id, r.id).then(() => true), 'Could not delete that reading.')
    if (ok) {
      void loadHistory()
      // The current value may have moved back; fetch the meter fresh rather than guess.
      const fresh = (await api.meters.list(meter.equipmentId)).find(x => x.id === meter.id)
      if (fresh) onUpdated(fresh)
    }
  }

  return (
    <li className={`${card} px-4 py-3 space-y-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{meter.name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {meter.currentReadAt ? `read ${formatDateTime(meter.currentReadAt)}` : 'no readings yet'}
            {meter.ratePerDay != null && ` · ≈ ${formatMeterValue(meter.ratePerDay, meter.unit)}/day`}
          </p>
        </div>
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
          {meter.currentValue != null ? formatMeterValue(meter.currentValue, meter.unit) : '—'}
        </p>
      </div>

      {canRecord && (
        <div className="flex gap-2">
          <input type="number" inputMode="decimal" step="any" value={value} onChange={e => setValue(e.target.value)}
            placeholder={`Current reading (${meter.unit})`} className="field" />
          <button onClick={record} disabled={busy || value === ''}
            className="px-4 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50 flex-shrink-0">
            Record
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        <button className="underline" onClick={() => { setShowHistory(v => !v); if (!history) void loadHistory() }}>
          {showHistory ? 'Hide history' : 'History'}
        </button>
        {canWrite && (
          <>
            <button className="underline disabled:opacity-40" disabled={busy || meter.currentValue == null} onClick={rebase}>Counter was reset</button>
            <button className="underline disabled:opacity-40" disabled={busy} onClick={replace}>Device replaced</button>
            <button className="underline text-red-500 disabled:opacity-40" disabled={busy} onClick={remove}>Delete</button>
          </>
        )}
      </div>

      {showHistory && (
        <ul className="text-xs divide-y divide-slate-100 dark:divide-slate-700">
          {history === null && <li className="py-1 text-slate-400">Loading…</li>}
          {history?.length === 0 && <li className="py-1 text-slate-400">No readings yet.</li>}
          {history?.map(r => (
            <li key={r.id} className="flex items-center gap-2 py-1">
              <span className="text-slate-500 dark:text-slate-400 w-28 flex-shrink-0">{formatDateTime(r.readAt)}</span>
              <span className={`tabular-nums text-slate-700 dark:text-slate-200 ${new Date(r.readAt) < new Date(meter.baselineAt) ? 'line-through opacity-60' : ''}`}>
                {formatMeterValue(r.value, meter.unit)}
              </span>
              {r.source && <span className="text-slate-400 dark:text-slate-500">{r.source}</span>}
              {canWrite && (
                <button onClick={() => removeReading(r)} className="ml-auto text-slate-400 hover:text-red-500" aria-label="Delete reading">✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
