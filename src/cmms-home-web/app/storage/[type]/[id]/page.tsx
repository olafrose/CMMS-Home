'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import type { Part, StorageBox, Tool } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

// Group contents by box (+ a loose group) for shelves; boxes show a single flat group.
function groupByBox<T extends { id: string; boxId?: string; box?: StorageBox }>(
  items: T[], type: string,
): { label: string; items: T[] }[] {
  if (type === 'box') return items.length ? [{ label: '', items }] : []
  const byBox = new Map<string, { label: string; items: T[] }>()
  const loose: T[] = []
  for (const it of items) {
    if (it.boxId && it.box) {
      if (!byBox.has(it.boxId)) byBox.set(it.boxId, { label: `📦 ${it.box.name}`, items: [] })
      byBox.get(it.boxId)!.items.push(it)
    } else {
      loose.push(it)
    }
  }
  const result = [...byBox.values()]
  if (loose.length) result.push({ label: 'Loose on shelf', items: loose })
  return result
}

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

function ToolLine({ tool }: { tool: Tool }) {
  const loan = tool.loans?.find(l => !l.returnedAt)
  return (
    <Link href={`/tools/${tool.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{tool.name}</p>
        {tool.toolCategory && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{tool.toolCategory.name}</p>}
      </div>
      {loan && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          {loan.borrower}
        </span>
      )}
      <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
    </Link>
  )
}

export default function StorageContentsPage() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [parts, setParts] = useState<Part[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  const valid = type === 'box' || type === 'shelf'

  useEffect(() => {
    setOrigin(window.location.origin)
    if (!valid) { setLoading(false); return }

    async function load() {
      const filter = type === 'box' ? { boxId: id } : { shelfId: id }
      if (type === 'box') {
        const [boxes, foundParts, foundTools] = await Promise.all([
          api.boxes.list(), api.parts.list(filter), api.tools.list(filter),
        ])
        const box = boxes.find(b => b.id === id)
        setTitle(box?.name ?? 'Box')
        setSubtitle(box
          ? (box.shelf ? `${box.shelf.name} › ${box.shelf.location.name}` : box.location?.name ?? '')
          : '')
        setParts(foundParts); setTools(foundTools)
      } else {
        const [shelves, foundParts, foundTools] = await Promise.all([
          api.shelves.list(), api.parts.list(filter), api.tools.list(filter),
        ])
        const shelf = shelves.find(s => s.id === id)
        setTitle(shelf?.name ?? 'Shelf')
        setSubtitle(shelf?.location.name ?? '')
        setParts(foundParts); setTools(foundTools)
      }
    }
    load().finally(() => setLoading(false))
  }, [type, id, valid])

  const partGroups = groupByBox(parts, type)
  const toolGroups = groupByBox(tools, type)
  const total = parts.length + tools.length

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
          Contents ({total})
        </h2>
        {total === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nothing stored here yet.</p>
        ) : (
          <div className="space-y-5">
            {parts.length > 0 && (
              <div className="space-y-4">
                {tools.length > 0 && <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">🔩 Parts</p>}
                {partGroups.map((g, i) => (
                  <div key={i}>
                    {g.label && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{g.label}</p>}
                    <ul className="space-y-2">
                      {g.items.map(p => <li key={p.id}><PartLine part={p} /></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {tools.length > 0 && (
              <div className="space-y-4">
                {parts.length > 0 && <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">🛠️ Tools</p>}
                {toolGroups.map((g, i) => (
                  <div key={i}>
                    {g.label && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{g.label}</p>}
                    <ul className="space-y-2">
                      {g.items.map(t => <li key={t.id}><ToolLine tool={t} /></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
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
