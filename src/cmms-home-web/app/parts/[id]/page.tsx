'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import EntityCombobox from '@/components/EntityCombobox'
import StoragePicker from '@/components/StoragePicker'
import type { Asset, Part, PartCategory, PartUsage } from '@/lib/types'

const UNIT_SUGGESTIONS = ['each', 'L', 'mL', 'kg', 'g', 'm', 'cm', 'pack']

// Breadcrumb segments; box/shelf link to their contents pages, location is plain text.
function storageSegments(part: Part): { label: string; href?: string }[] {
  if (part.box) {
    const segs: { label: string; href?: string }[] = [{ label: part.box.name, href: `/storage/box/${part.boxId}` }]
    if (part.box.shelf) {
      segs.push({ label: part.box.shelf.name, href: `/storage/shelf/${part.box.shelfId}` })
      segs.push({ label: part.box.shelf.location.name })
    } else if (part.box.location) {
      segs.push({ label: part.box.location.name })
    }
    return segs
  }
  if (part.shelf) {
    return [
      { label: part.shelf.name, href: `/storage/shelf/${part.shelfId}` },
      { label: part.shelf.location.name },
    ]
  }
  if (part.location) return [{ label: part.location.name }]
  return [{ label: 'No location' }]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PartDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [part, setPart] = useState<Part | null>(null)
  const [usages, setUsages] = useState<PartUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [minQuantity, setMinQuantity] = useState('')
  const [assetId, setAssetId] = useState('')
  const [partCategoryId, setPartCategoryId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('')
  const [shelfId, setShelfId] = useState('')
  const [boxId, setBoxId] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [partCategories, setPartCategories] = useState<PartCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => {
    Promise.all([api.parts.get(id), api.partUsages.list(id), api.assets.list(), api.partCategories.list()])
      .then(([p, u, asts, cats]) => {
        setPart(p); setUsages(u); setAssets(asts); setPartCategories(cats)
        setName(p.name); setUnit(p.unit)
        setMinQuantity(p.minQuantity != null ? String(p.minQuantity) : '')
        setAssetId(p.assetId ?? '')
        setPartCategoryId(p.partCategoryId ?? null)
        setLocationId(p.locationId ?? p.shelf?.locationId ?? p.box?.shelf?.locationId ?? p.box?.locationId ?? '')
        setShelfId(p.shelfId ?? p.box?.shelfId ?? '')
        setBoxId(p.boxId ?? '')
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    if (!part) return
    setSaving(true)
    try {
      const updated = await api.parts.update(id, {
        name: name.trim(), quantity: part.quantity, unit: unit.trim(),
        minQuantity: minQuantity ? Number(minQuantity) : undefined,
        assetId: assetId || undefined,
        partCategoryId: partCategoryId || undefined,
        boxId: boxId || undefined,
        shelfId: !boxId && shelfId ? shelfId : undefined,
        locationId: !boxId && !shelfId && locationId ? locationId : undefined,
      })
      setPart(updated); setEditing(false)
    } finally { setSaving(false) }
  }

  async function adjust(delta: number) {
    if (!part) return
    setAdjusting(true)
    try {
      const updated = await api.parts.update(id, {
        name: part.name, quantity: part.quantity + delta, unit: part.unit,
        minQuantity: part.minQuantity ?? undefined,
        assetId: part.assetId, partCategoryId: part.partCategoryId,
        boxId: part.boxId, shelfId: part.shelfId, locationId: part.locationId,
      })
      setPart(updated)
    } finally { setAdjusting(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${part?.name}"? This will also remove its usage history.`)) return
    await api.parts.delete(id)
    router.push('/parts')
  }

  async function removeUsage(usageId: string) {
    await api.partUsages.delete(usageId)
    setUsages(prev => prev.filter(u => u.id !== usageId))
    if (part) setPart({ ...part, quantity: part.quantity + (usages.find(u => u.id === usageId)?.quantityUsed ?? 0) })
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!part) return <div className="p-6 text-red-500 text-sm">Part not found</div>

  const lowStock = part.minQuantity != null && part.quantity <= part.minQuantity
  const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/parts" className="text-blue-500 text-sm">‹ Parts</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">{part.name}</h1>
        <button onClick={() => setEditing(v => !v)} className="text-sm text-blue-500 font-medium">
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Quantity card */}
      <div className={`${card} px-6 py-5 flex items-center justify-between`}>
        <div>
          <p className={`text-4xl font-bold ${lowStock ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {part.quantity}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{part.unit}</p>
          {lowStock && (
            <p className="text-xs text-amber-500 mt-1">Low stock — min {part.minQuantity} {part.unit}</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={() => adjust(-1)} disabled={adjusting}
            className="w-10 h-10 rounded-full border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xl font-bold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            −
          </button>
          <button onClick={() => adjust(1)} disabled={adjusting}
            className="w-10 h-10 rounded-full bg-blue-600 text-white text-xl font-bold hover:bg-blue-700 disabled:opacity-40">
            +
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className={`${card} px-4 py-4 space-y-3`}>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="field" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Unit</label>
              <input type="text" list="unit-suggestions-edit" value={unit} onChange={e => setUnit(e.target.value)} className="field" />
              <datalist id="unit-suggestions-edit">
                {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Low-stock below</label>
              <input type="number" min="0" step="any" value={minQuantity} onChange={e => setMinQuantity(e.target.value)}
                placeholder="optional" className="field" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">For asset</label>
            <select value={assetId} onChange={e => setAssetId(e.target.value)} className="field">
              <option value="">— none —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <EntityCombobox
              items={partCategories}
              value={partCategoryId}
              onChange={setPartCategoryId}
              onCreate={async (name) => {
                const cat = await api.partCategories.create(name)
                setPartCategories(prev => [...prev, cat])
                return cat
              }}
              placeholder="Search or create…"
            />
          </div>
          <StoragePicker
            value={{ locationId, shelfId, boxId }}
            onChange={(s) => { setLocationId(s.locationId); setShelfId(s.shelfId); setBoxId(s.boxId) }}
          />
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Storage + details */}
      {!editing && (
        <div className={`${card} px-4 py-3 space-y-2`}>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Stored at</p>
            <p className="text-sm">
              {storageSegments(part).map((s, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-slate-300 dark:text-slate-600"> › </span>}
                  {s.href
                    ? <Link href={s.href} className="text-blue-600 dark:text-blue-400">{s.label}</Link>
                    : <span className="text-slate-700 dark:text-slate-200">{s.label}</span>}
                </span>
              ))}
            </p>
          </div>
          {part.asset && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">For asset</p>
              <Link href={`/assets/${part.assetId}`} className="text-sm text-blue-600 dark:text-blue-400">{part.asset.name}</Link>
            </div>
          )}
          {part.partCategory && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Category</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{part.partCategory.name}</p>
            </div>
          )}
        </div>
      )}

      {/* Usage history */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          Usage history ({usages.length})
        </h2>
        {usages.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No recorded usage yet.</p>
        ) : (
          <ul className="space-y-2">
            {usages.map(u => (
              <li key={u.id} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {u.quantityUsed} {part.unit} used
                  </p>
                </div>
                <button onClick={() => removeUsage(u.id)}
                  className="text-slate-400 hover:text-red-500 text-sm leading-none"
                  aria-label="Remove usage">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Delete */}
      <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <button onClick={handleDelete}
          className="w-full text-red-600 dark:text-red-400 font-medium py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          Delete Part
        </button>
      </section>
    </div>
  )
}
