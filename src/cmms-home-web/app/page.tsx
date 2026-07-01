'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Asset, MaintenanceEvent, MaintenanceRule, Part, Tool } from '@/lib/types'

function addInterval(date: Date, value: number, unit: MaintenanceRule['intervalUnit']): Date {
  const d = new Date(date)
  if (unit === 'Weeks')  d.setDate(d.getDate() + value * 7)
  else if (unit === 'Months') d.setMonth(d.getMonth() + value)
  else if (unit === 'Years')  d.setFullYear(d.getFullYear() + value)
  else d.setDate(d.getDate() + value)
  return d
}

function dueDate(rule: MaintenanceRule): Date | null {
  if (rule.scheduleType === 'DueDate') return rule.nextDueAt ? new Date(rule.nextDueAt) : null
  return rule.lastDoneAt ? addInterval(new Date(rule.lastDoneAt), rule.intervalValue, rule.intervalUnit) : null
}

function daysRelative(rule: MaintenanceRule): number {
  const due = dueDate(rule)
  if (!due) return -Infinity
  return Math.round((due.getTime() - Date.now()) / 86_400_000)
}

// The instant the backend flags the rule Overdue: the due date plus the grace window
// for DueDate schedules (Interval schedules have no window, so it's the due date itself).
function overdueDate(rule: MaintenanceRule): Date | null {
  const due = dueDate(rule)
  if (!due) return null
  if (rule.scheduleType === 'DueDate' && rule.dueWindowValue > 0)
    return addInterval(due, rule.dueWindowValue, rule.dueWindowUnit)
  return due
}

function dueLabel(rule: MaintenanceRule): string {
  const due = dueDate(rule)
  if (!due) return rule.scheduleType === 'DueDate' ? 'No due date set' : 'Never done — do it now'
  // Overdue is counted from the end of the grace window, not the due date itself.
  if (rule.status === 'Overdue') {
    const over = overdueDate(rule) ?? due
    const d = Math.max(1, Math.round((Date.now() - over.getTime()) / 86_400_000))
    return `${d} day${d !== 1 ? 's' : ''} overdue`
  }
  const d = daysRelative(rule)
  // Past the due date but still within the grace window: backend reports Due.
  if (d < 0) return 'Due now'
  if (d === 0) return 'Due today'
  return `Due in ${d} day${d !== 1 ? 's' : ''}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DashboardPage() {
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [lowStockParts, setLowStockParts] = useState<Part[]>([])
  const [loanedTools, setLoanedTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.assets.list(), api.rules.list(), api.events.list(), api.parts.list({ lowStock: true }), api.tools.list({ onLoan: true })])
      .then(([a, r, e, p, t]) => {
        setAssets(Object.fromEntries(a.map((x) => [x.id, x])))
        setRules(r.sort((a, b) => daysRelative(a) - daysRelative(b)))
        setEvents(e.slice(0, 5))
        setLowStockParts(p)
        setLoanedTools(t)
      })
      .finally(() => setLoading(false))
  }, [])

  const overdue = rules.filter((r) => r.status === 'Overdue' || r.status === 'Due')
  const upcoming = rules.filter((r) => r.status === 'Upcoming')

  return (
    <div className="max-w-lg mx-auto pb-4 space-y-5">

      {/* Header banner */}
      <div className={`px-4 pt-8 pb-5 ${overdue.length > 0 ? 'bg-red-600' : 'bg-blue-600'}`}>
        <h1 className="text-xl font-bold text-white mb-1">CMMS@home</h1>
        {loading ? (
          <p className="text-white/70 text-sm">Loading…</p>
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
              {overdue.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/assets/${r.assetId}/log`}
                    className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{assets[r.assetId]?.name ?? '…'}</p>
                      {r.name && <p className="text-xs text-slate-600 dark:text-slate-300">{r.name}</p>}
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">{dueLabel(r)}</p>
                    </div>
                    <span className="text-sm text-red-500 dark:text-red-400 font-bold">Log →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Upcoming */}
        {!loading && upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Upcoming</h2>
            <ul className="space-y-2">
              {upcoming.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/assets/${r.assetId}`}
                    className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{assets[r.assetId]?.name ?? '…'}</p>
                      {r.name && <p className="text-xs text-slate-600 dark:text-slate-300">{r.name}</p>}
                      <p className="text-xs text-amber-700 dark:text-amber-400">{dueLabel(r)}</p>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500 text-lg">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* All caught up */}
        {!loading && overdue.length === 0 && upcoming.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <p className="text-4xl mb-2">✅</p>
            <p className="font-medium text-slate-600 dark:text-slate-300">All caught up!</p>
            {rules.length === 0 && (
              <p className="text-sm mt-1">
                <Link href="/assets/new" className="text-blue-500 underline">Add an asset</Link> to start tracking.
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
        {!loading && loanedTools.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Out on loan</h2>
            <ul className="space-y-2">
              {loanedTools.map((t) => {
                const loan = t.loans?.find((l) => !l.returnedAt)
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tools/${t.id}`}
                      className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
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
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/assets/${e.assetId}`}
                    className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl px-4 py-3 shadow-sm border border-slate-100 dark:border-slate-700"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{assets[e.assetId]?.name ?? '…'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{e.type}</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(e.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </div>
  )
}
