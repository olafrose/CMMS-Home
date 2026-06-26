'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import type { Part } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function PartLine({ part }: { part: Part }) {
  const lowStock = part.minQuantity != null && part.quantity <= part.minQuantity
  return (
    <Link href={`/parts/${part.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{part.name}</p>
        {part.partCategory && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{part.partCategory.name}</p>}
      </div>
      <span className={`text-sm font-semibold ${lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
        {part.quantity} {part.unit}
      </span>
      <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
    </Link>
  )
}

export default function StorageContentsPage() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [parts, setParts] = useState<Part[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  const valid = type === 'box' || type === 'shelf'

  useEffect(() => {
    setOrigin(window.location.origin)
    if (!valid) { setLoading(false); return }

    async function load() {
      if (type === 'box') {
        const [boxes, found] = await Promise.all([api.boxes.list(), api.parts.list({ boxId: id })])
        const box = boxes.find(b => b.id === id)
        setTitle(box?.name ?? 'Box')
        setSubtitle(box
          ? (box.shelf ? `${box.shelf.name} › ${box.shelf.location.name}` : box.location?.name ?? '')
          : '')
        setParts(found)
      } else {
        const [shelves, found] = await Promise.all([api.shelves.list(), api.parts.list({ shelfId: id })])
        const shelf = shelves.find(s => s.id === id)
        setTitle(shelf?.name ?? 'Shelf')
        setSubtitle(shelf?.location.name ?? '')
        setParts(found)
      }
    }
    load().finally(() => setLoading(false))
  }, [type, id, valid])

  // Group shelf contents by box (+ a loose group); boxes show a single flat group.
  const groups: { label: string; parts: Part[] }[] = (() => {
    if (type === 'box') return parts.length ? [{ label: '', parts }] : []
    const byBox = new Map<string, { label: string; parts: Part[] }>()
    const loose: Part[] = []
    for (const p of parts) {
      if (p.boxId && p.box) {
        if (!byBox.has(p.boxId)) byBox.set(p.boxId, { label: `📦 ${p.box.name}`, parts: [] })
        byBox.get(p.boxId)!.parts.push(p)
      } else {
        loose.push(p)
      }
    }
    const result = [...byBox.values()]
    if (loose.length) result.push({ label: 'Loose on shelf', parts: loose })
    return result
  })()

  const qrUrl = `${process.env.NEXT_PUBLIC_QR_BASE_URL || origin}/storage/${type}/${id}`

  if (!valid) return <div className="p-6 text-red-500 text-sm">Unknown storage type.</div>
  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/storage" className="text-blue-500 text-sm">‹ Storage</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">
          {type === 'box' ? '📦' : '🗄️'} {title}
        </h1>
      </div>
      {subtitle && <p className="-mt-3 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}

      {/* Contents */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          Contents ({parts.length})
        </h2>
        {parts.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nothing stored here yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g, i) => (
              <div key={i}>
                {g.label && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{g.label}</p>}
                <ul className="space-y-2">
                  {g.parts.map(p => <li key={p.id}><PartLine part={p} /></li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* QR code */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">QR Code</h2>
        <div className={`${card} p-5 flex flex-col items-center gap-2`}>
          {origin && <QRCodeSVG value={qrUrl} size={160} bgColor="transparent" fgColor="currentColor"
            className="text-slate-900 dark:text-slate-100" />}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to see what&apos;s stored here</p>
        </div>
      </section>
    </div>
  )
}
