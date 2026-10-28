'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { loadErrorMessage, optional } from '@/lib/load'
import { DEFAULT_LOCATION_ICON, formatLocationPath } from '@/lib/storage'
import { eventHref, targetHref, targetLogHref, targetOf } from '@/lib/maintenance'
import { usageProgress } from '@/lib/meters'
import type { AppSettings, Equipment, MaintenanceEvent, MaintenanceRule, Part, StorageLocation } from '@/lib/types'

// Whole days from now until an instant (negative = past). Pure date formatting — the
// schedule arithmetic that produces rule.dueAt/overdueAt lives in MaintenanceRule.cs,
// deliberately not duplicated here.
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

// Sort key: soonest first, with "never done" rules ahead of everything. A finite
// sentinel, not -Infinity, so two never-done rules don't compare NaN.
function urgency(rule: MaintenanceRule): number {
  return rule.dueAt ? daysUntil(rule.dueAt) : -1e9
}

function dueLabel(rule: MaintenanceRule): string {
  // Counted in hours/km/cycles unless the calendar ceiling is what makes it due, in which
  // case the day-based wording below says it better.
  if (rule.scheduleType === 'Usage' && rule.dueReason !== 'Time') return usageProgress(rule)
  if (!rule.dueAt) return rule.scheduleType === 'DueDate' ? 'No due date set' : 'Never done — do it now'
  // Overdue is counted from the point the backend flags it, i.e. past the due day and
  // any grace window.
  if (rule.status === 'Overdue') {
    const d = Math.max(1, -daysUntil(rule.overdueAt ?? rule.dueAt))
    return `${d} day${d !== 1 ? 's' : ''} overdue`
  }
  const d = daysUntil(rule.dueAt)
  // Past the due date but still within the grace window: backend reports Due.
  if (d < 0) return 'Due now'
  if (d === 0) return 'Due today'
  return `Due in ${d} day${d !== 1 ? 's' : ''}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Where the thing is, shortened per the user's policy. Without this, two similarly
// named assets are indistinguishable in these lists.
function PathLine({ path }: { path: string }) {
  if (!path) return null
  return <p className="text-xs text-slate-400 dark:text-slate-500">{path}</p>
}

export default function DashboardPage() {
  const [equipment, setEquipment] = useState<Record<string, Equipment>>({})
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [lowStockParts, setLowStockParts] = useState<Part[]>([])
  const [loanedEquipment, setLoanedEquipment] = useState<Equipment[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [settings, setSettings] = useState<AppSettings>()
  const [loading, setLoading] = useState(true)
  // The schedule is the dashboard's point; every other section is optional and simply
  // stays hidden when its read is refused (each needs a different right).
  const [rulesError, setRulesError] = useState('')

  useEffect(() => {
    Promise.all([
      optional(api.equipment.list(), []),
      api.rules.list().catch((err) => { setRulesError(loadErrorMessage(err, 'the maintenance schedule')); return [] }),
      optional(api.events.list(), []), optional(api.parts.list({ lowStock: true }), []),
      optional(api.equipment.list({ onLoan: true }), []), optional(api.storageLocations.list(), []),
      optional(api.appSettings.get(), undefined),
    ])
      .then(([eq, r, e, p, loaned, places, s]) => {
        setEquipment(Object.fromEntries(eq.map((x) => [x.id, x])))
        setRules(r.sort((a, b) => urgency(a) - urgency(b)))
        setEvents(e.slice(0, 5))
        setLowStockParts(p)
        setLoanedEquipment(loaned)
        setLocations(places)
        setSettings(s)
      })
      .finally(() => setLoading(false))
  }, [])

  // Breadcrumb for anything holding a storageLocationId.
  const pathOf = (locationId?: string) => formatLocationPath(locationId, locations, settings)

  // What a rule or event is about, for display: an item (named, with where it is kept) or a
  // place (its icon marks it as one, and its path is where the place itself sits).
  function describe(x: { equipmentId: string | null; storageLocationId: string | null }) {
    const target = targetOf(x)
    if (target.kind === 'place') {
      const place = locations.find((l) => l.id === target.id)
      return {
        target,
        name: place ? `${place.icon ?? DEFAULT_LOCATION_ICON} ${place.name}` : '…',
        path: pathOf(place?.parentId),
      }
    }
    const item = equipment[target.id]
    return { target, name: item?.name ?? '…', path: pathOf(item?.storageLocationId) }
  }

  const overdue = rules.filter((r) => r.status === 'Overdue' || r.status === 'Due')
  const upcoming = rules.filter((r) => r.status === 'Upcoming')

  return (
    <div className="max-w-lg mx-auto pb-4 space-y-5">

      {/* Header banner */}
      <div className={`px-4 pt-8 pb-5 ${overdue.length > 0 ? 'bg-red-600' : 'bg-blue-600'}`}>
        <h1 className="text-xl font-bold text-white mb-1">CMMS@home</h1>
        {loading ? (
          <p className="text-white/70 text-sm">Loading…</p>
        ) : rulesError ? (
          <p className="text-white/80 text-sm">{rulesError}</p>
        ) : overdue.length > 0 ? (
          <p className="text-white font-semibold text-lg">
            ⚠️ {overdue.length} item{overdue.length !== 1 ? 's' : ''} need{overdue.length === 1 ? 's' : ''} attention
            {upcoming.length > 0 && <span className="text-white/80 text-base font-normal">, {upcoming.length} upcoming</span>}
          </p>
        ) : upcoming.length > 0 ? (
          <p className="text-white font-semibold">
            🔔 {upcoming.length} item{upcoming.length !== 1 ? 's' : ''} coming due soon
          </p>
        ) : (
          <p className="text-white/80 text-sm">All maintenance up to date</p>
        )}
      </div>

      <div className="px-4 space-y-5">

        {/* Overdue / Due */}
        {!loading && overdue.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mb-2">Action required</h2>
            <ul className="space-y-2">
              {overdue.map((r) => { const d = describe(r); return (
                <li key={r.id}>
                  <Link
                    href={targetLogHref(d.target)}
                    className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</p>
                      <PathLine path={d.path} />
                      {r.name && <p className="text-xs text-slate-600 dark:text-slate-300">{r.name}</p>}
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">{dueLabel(r)}</p>
                    </div>
                    <span className="text-sm text-red-500 dark:text-red-400 font-bold">Log →</span>
                  </Link>
                </li>
              )})}
            </ul>
          </section>
        )}

        {/* Upcoming */}
        {!loading && upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Upcoming</h2>
            <ul className="space-y-2">
              {upcoming.map((r) => { const d = describe(r); return (
                <li key={r.id}>
                  <Link
                    href={targetHref(d.target)}
                    className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
                      <PathLine path={d.path} />
                      {r.name && <p className="text-xs text-slate-600 dark:text-slate-300">{r.name}</p>}
                      <p className="text-xs text-amber-700 dark:text-amber-400">{dueLabel(r)}</p>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500 text-lg">›</span>
                  </Link>
                </li>
              )})}
            </ul>
          </section>
        )}

        {/* All caught up */}
        {!loading && !rulesError && overdue.length === 0 && upcoming.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <p className="text-4xl mb-2">✅</p>
            <p className="font-medium text-slate-600 dark:text-slate-300">All caught up!</p>
            {rules.length === 0 && (
              <p className="text-sm mt-1">
                <Link href="/equipment/new" className="text-blue-500 underline">Add equipment</Link> to start tracking.
              </p>
            )}
          </div>
        )}

        {/* Low stock parts */}
        {!loading && lowStockParts.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Low stock</h2>
            <ul className="space-y-2">
              {lowStockParts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/parts/${p.id}`}
                    className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{p.name}</p>
                      <PathLine path={pathOf(p.storageLocationId)} />
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {p.quantity} {p.unit} remaining (min {p.minQuantity})
                      </p>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500 text-lg">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tools out on loan */}
        {!loading && loanedEquipment.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Out on loan</h2>
            <ul className="space-y-2">
              {loanedEquipment.map((t) => {
                const loan = t.loans?.find((l) => !l.returnedAt)
                return (
                  <li key={t.id}>
                    <Link
                      href={`/equipment/${t.id}`}
                      className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
                        <PathLine path={pathOf(t.storageLocationId)} />
                        {loan && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {loan.borrower} · since {formatDate(loan.loanedAt)}
                          </p>
                        )}
                      </div>
                      <span className="text-slate-400 dark:text-slate-500 text-lg">›</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Recent activity */}
        {!loading && events.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Recent activity</h2>
            <ul className="space-y-2">
              {events.map((e) => { const d = describe(e); return (
                <li key={e.id}>
                  <Link
                    href={eventHref(e.id, d.target)}
                    className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl px-4 py-3 shadow-sm border border-slate-100 dark:border-slate-700"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
                      <PathLine path={d.path} />
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{e.type}</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(e.createdAt)}</span>
                  </Link>
                </li>
              )})}
            </ul>
          </section>
        )}

      </div>
    </div>
  )
}
