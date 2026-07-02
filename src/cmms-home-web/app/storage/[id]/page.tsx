'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import { DEFAULT_LOCATION_ICON } from '@/lib/storage'
import type { StorageLocationContents } from '@/lib/types'

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
  const [data, setData] = useState<StorageLocationContents | null>(null)
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setOrigin(window.location.origin)
    api.storageLocations.contents(id).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!data) return <div className="p-6 text-red-500 text-sm">Place not found.</div>

  const { location, ancestors, children, parts, equipment } = data
  const total = children.length + parts.length + equipment.length
  const qrUrl = `${process.env.NEXT_PUBLIC_QR_BASE_URL || origin}/storage/${id}`

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

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">QR Code</h2>
          <Link href={`/labels?only=place:${id}`} className="text-sm text-blue-500 font-medium">🖨️ Print label</Link>
        </div>
        <div className={`${card} p-5 flex flex-col items-center gap-2`}>
          {origin && <QRCodeSVG value={qrUrl} size={160} bgColor="transparent" fgColor="currentColor" className="text-slate-900 dark:text-slate-100" />}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to see what&apos;s stored here</p>
        </div>
      </section>
    </div>
  )
}
