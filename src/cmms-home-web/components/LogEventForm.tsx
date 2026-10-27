'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import { EVENT_TYPES, eventHref, targetFields, targetHref } from '@/lib/maintenance'
import type { MaintenanceRule, MaintenanceTarget, Meter } from '@/lib/types'


/**
 * The quick-log form (≤10 s from scan to saved), for either an item or a place. Both
 * `/equipment/{id}/log` and `/storage/{id}/log` are this with a different target.
 */
export default function LogEventForm({ target }: { target: MaintenanceTarget }) {
  const { kind, id } = target
  const router = useRouter()
  const [type, setType] = useState('maintenance')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Due-date schedules on this target, with an editable next-due date each
  const [dueRules, setDueRules] = useState<MaintenanceRule[]>([])
  const [dueDates, setDueDates] = useState<Record<string, string>>({})

  // The item's meters, for the optional "meter readings" disclosure. Collapsed and
  // pre-filled, so the one-tap path is untouched: an unchanged value is never sent, and the
  // server then takes its latest reading as the new baseline for usage schedules.
  const { can } = useAuth()
  const canRecordMeters = kind === 'equipment' && can('meters.read') && can('meters.record')
  const canReplaceMeters = kind === 'equipment' && can('meters.write')
  const [meters, setMeters] = useState<Meter[]>([])
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [showReadings, setShowReadings] = useState(false)
  const [replaced, setReplaced] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!canRecordMeters && !canReplaceMeters) return
    api.meters.list(id)
      .then((ms) => {
        setMeters(ms)
        setReadings(Object.fromEntries(ms.map((m) => [m.id, m.currentValue != null ? String(m.currentValue) : ''])))
      })
      .catch(() => {})
  }, [id, canRecordMeters, canReplaceMeters])

  // The in-flight label-token exchange, or null when we arrived without a token.
  const labelSession = useRef<Promise<void> | null>(null)

  useEffect(() => {
    // A printed label carries a signed token; trading it for a scope covering this one target
    // is what lets an anonymous scan save. Read from window rather than useSearchParams to
    // avoid a Suspense boundary, as /labels does.
    const token = new URLSearchParams(window.location.search).get('t')
    // Fired, never awaited on the render path: the form paints from local defaults and stays
    // one tap from saved, exactly as the rules fetch below always has.
    const authorised = token
      ? api.auth.labelSession({ kind, id }, token).then(() => {}, () => {})
      : Promise.resolve()
    labelSession.current = token ? authorised : null

    // Sequenced behind the exchange so a label-scoped scan can read its own schedules.
    // Without a token this is a microtask, so nothing is delayed for a signed-in user.
    authorised
      .then(() => api.rules.list({ kind, id }))
      .then((rs) => {
        const due = rs.filter((r) => r.scheduleType === 'DueDate')
        setDueRules(due)
        setDueDates(Object.fromEntries(
          due.map((r) => [r.id, r.nextDueAt ? new Date(r.nextDueAt).toISOString().slice(0, 10) : '']),
        ))
      })
      .catch(() => {})
  }, [kind, id])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      // Usually already settled while the user was picking a type; awaiting only costs
      // something on the rare tap that beats the network.
      if (labelSession.current) await labelSession.current

      // Only the values the user actually changed: an untouched field is the current value,
      // which the server would take as the baseline anyway.
      const meterReadings = canRecordMeters
        ? meters
          .filter((m) => readings[m.id] !== '' && Number(readings[m.id]) !== m.currentValue && Number.isFinite(Number(readings[m.id])))
          .map((m) => ({ meterId: m.id, value: Number(readings[m.id]) }))
        : []

      const event = await api.events.create({
        ...targetFields({ kind, id }),
        type,
        note: note.trim() || undefined,
        occurredAt: new Date(date).toISOString(),
        ...(meterReadings.length ? { meterReadings } : {}),
      })

      // A replacement that swapped the whole device restarts its meters (and the usage
      // schedules on them) at 0. After the event, so a refusal can't lose the log; reported
      // rather than swallowed, because a meter left on the old device's count is wrong.
      const toReplace = type === 'replacement' && canReplaceMeters ? meters.filter((m) => replaced[m.id]) : []
      if (toReplace.length) {
        const isToday = date === new Date().toISOString().slice(0, 10)
        const replacedAt = isToday ? undefined : new Date(new Date(date).getTime() + 86_400_000 - 1).toISOString()
        const failed: string[] = []
        for (const m of toReplace) await api.meters.replace(m.id, 0, replacedAt).catch(() => failed.push(m.name))
        if (failed.length) alert(`Logged, but could not restart: ${failed.join(', ')}. Mark the device replaced on the item's page.`)
      }

      // Push any new next-due dates for the target's due-date schedules. Deliberately
      // non-fatal: the event is already stored by now, and someone logging from a scanned
      // label holds no rules.write — letting that 403 escape would block the navigation and
      // present a successful save as a failure.
      await Promise.all(dueRules
        .filter((r) => {
          const v = dueDates[r.id]
          const orig = r.nextDueAt ? new Date(r.nextDueAt).toISOString().slice(0, 10) : ''
          return v && v !== orig
        })
        .map((r) => api.rules.update(r.id, { nextDueAt: new Date(dueDates[r.id]).toISOString() })
          .catch(() => {})))

      router.push(eventHref(event.id, { kind, id }))
    } catch (e) {
      // The save itself failed. Say why when the server told us, so a refusal doesn't read
      // as the button simply not working.
      const meterError = e instanceof ApiError
        ? Object.entries(e.errors ?? {}).find(([k]) => k.startsWith('meterReadings.'))?.[1]?.join(' ')
        : undefined
      setError(meterError ? `Meter reading refused: ${meterError}`
        : e instanceof ApiError && e.isDenied
          ? `Not allowed to log maintenance on this ${kind === 'place' ? 'place' : 'item'}. Scan its label again, or sign in.`
          : 'Could not save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={targetHref({ kind, id })} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Log Maintenance</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {EVENT_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`border-2 rounded-xl py-4 text-sm font-semibold transition-all ${
              type === t.value
                ? t.active + ' border-current'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What did you do?"
          className="field resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
      </div>

      {dueRules.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Next due date</label>
          {dueRules.map((r) => (
            <div key={r.id}>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                {r.name || 'Due-date schedule'}
              </label>
              <input
                type="date"
                value={dueDates[r.id] ?? ''}
                onChange={(e) => setDueDates((prev) => ({ ...prev, [r.id]: e.target.value }))}
                className="field"
              />
            </div>
          ))}
        </div>
      )}

      {canRecordMeters && meters.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowReadings((v) => !v)}
            className="text-sm font-medium text-slate-600 dark:text-slate-300" aria-expanded={showReadings}>
            {showReadings ? '▾' : '▸'} Meter readings <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
          </button>
          {showReadings && (
            <div className="space-y-2 mt-2">
              {meters.map((m) => (
                <div key={m.id}>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{m.name} at the service ({m.unit})</label>
                  <input type="number" inputMode="decimal" step="any" value={readings[m.id] ?? ''}
                    onChange={(e) => setReadings((prev) => ({ ...prev, [m.id]: e.target.value }))} className="field" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {type === 'replacement' && canReplaceMeters && meters.length > 0 && (
        <div className="space-y-1">
          {meters.map((m) => (
            <label key={m.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={!!replaced[m.id]} className="w-4 h-4 mt-0.5 accent-blue-600"
                onChange={(e) => setReplaced((prev) => ({ ...prev, [m.id]: e.target.checked }))} />
              <span>Device replaced — restart &ldquo;{m.name}&rdquo; at 0 <span className="block text-xs text-slate-400 dark:text-slate-500">Its usage schedules start fresh.</span></span>
            </label>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl shadow text-lg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
