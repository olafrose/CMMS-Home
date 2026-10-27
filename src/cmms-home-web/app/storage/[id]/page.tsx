'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import { DEFAULT_LOCATION_ICON } from '@/lib/storage'
import AddToLocation from '@/components/AddToLocation'
import MaintenanceSchedule from '@/components/MaintenanceSchedule'
import MaintenanceHistory from '@/components/MaintenanceHistory'
import { useAuth } from '@/components/AuthProvider'
import { targetLogHref } from '@/lib/maintenance'
import type { MaintenanceEvent, MaintenanceRule, MaintenanceTarget, StorageLocationContents } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function Row({ href, icon, name, sub, badge }: { href: string; icon: string; name: string; sub?: string; badge?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-3 ${card} px-4 py-3`}>
      <span className="text-lg leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{name}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{sub}</p>}
      </div>
      {badge && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">{badge}</span>}
      <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
    </Link>
  )
}

export default function StorageContentsPage() {
  const { id } = useParams<{ id: string }>()
  const { loading: authLoading, can } = useAuth()
  const [data, setData] = useState<StorageLocationContents | null>(null)
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  function load() {
    return api.storageLocations.contents(id).then(setData).catch(() => setData(null))
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    load().finally(() => setLoading(false))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The place's own maintenance — literal, not what is stored in it. Fetched apart from the
  // contents, and only when readable, so a role that may browse storage but not history
  // still gets the page rather than a failed Promise.all.
  const canReadEvents = !authLoading && can('events.read')
  const canReadRules = !authLoading && can('rules.read')
  useEffect(() => {
    if (canReadEvents) api.events.list({ kind: 'place', id }).then(setEvents).catch(() => {})
  }, [id, canReadEvents])
  useEffect(() => {
    if (canReadRules) api.rules.list({ kind: 'place', id }).then(setRules).catch(() => {})
  }, [id, canReadRules])

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!data) return <div className="p-6 text-red-500 text-sm">Place not found.</div>

  const { location, ancestors, children, parts, equipment } = data
  const total = children.length + parts.length + equipment.length
  const target: MaintenanceTarget = { kind: 'place', id }
  const qrBase = process.env.NEXT_PUBLIC_QR_BASE_URL || origin
  const qrUrl = `${qrBase}/storage/${id}`
  const logUrl = `${qrBase}${targetLogHref(target)}`

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/storage" className="text-blue-500 text-sm">‹ Storage</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">{location.icon || DEFAULT_LOCATION_ICON} {location.name}</h1>
      </div>
      {ancestors.length > 0 && (
        <p className="-mt-3 text-sm text-slate-500 dark:text-slate-400">{ancestors.map(a => a.name).join(' › ')}</p>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Contents ({total})</h2>
        {total === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nothing stored here yet.</p>
        ) : (
          <div className="space-y-2">
            {children.map(c => <Row key={c.id} href={`/storage/${c.id}`} icon={c.icon || DEFAULT_LOCATION_ICON} name={c.name} sub="Place" />)}
            {equipment.map(e => <Row key={e.id} href={`/equipment/${e.id}`} icon={e.kind === 'Tool' ? '🛠️' : '🔧'} name={e.name} sub={e.category?.name}
              badge={e.loans?.find(l => !l.returnedAt)?.borrower} />)}
            {parts.map(p => <Row key={p.id} href={`/parts/${p.id}`} icon="🔩" name={p.name} sub={p.partCategory?.name} />)}
          </div>
        )}
      </section>

      <AddToLocation locationId={id} onChanged={load} />

      {/* Maintenance on the place itself (a room repainted, gutters cleaned) */}
      {can('events.create') && (
        <Link href={targetLogHref(target)} className="block w-full bg-blue-600 text-white text-center font-semibold py-4 rounded-xl shadow text-lg">+ Log Maintenance</Link>
      )}
      {canReadRules && <MaintenanceSchedule target={target} rules={rules} setRules={setRules} />}
      {canReadEvents && <MaintenanceHistory target={target} events={events} />}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">QR Code</h2>
          <Link href={`/labels?only=place:${id}`} className="text-sm text-blue-500 font-medium">🖨️ Print label</Link>
        </div>
        <div className={`${card} p-5 grid grid-cols-2 gap-4`}>
          <div className="flex flex-col items-center gap-2">
            {origin && <QRCodeSVG value={qrUrl} size={120} bgColor="transparent" fgColor="currentColor" className="text-slate-900 dark:text-slate-100" />}
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to see what&apos;s stored here</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            {origin && <QRCodeSVG value={logUrl} size={120} bgColor="transparent" fgColor="currentColor" className="text-slate-900 dark:text-slate-100" />}
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to log maintenance</p>
          </div>
        </div>
      </section>
    </div>
  )
}
