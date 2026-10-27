'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import EntityCombobox from '@/components/EntityCombobox'
import EquipmentMultiSelect from '@/components/EquipmentMultiSelect'
import StorageLocationPicker from '@/components/StorageLocationPicker'
import { DocumentPreviewButton } from '@/components/DocumentPreview'
import { useAuth } from '@/components/AuthProvider'
import { locationPath } from '@/lib/storage'
import ExternalLinkList from '@/components/ExternalLinkList'
import MaintenanceSchedule from '@/components/MaintenanceSchedule'
import MaintenanceHistory from '@/components/MaintenanceHistory'
import MeterList from '@/components/MeterList'
import WarrantyFields, { EMPTY_WARRANTY, warrantyFromEquipment, warrantyToDto, type WarrantyValues } from '@/components/WarrantyFields'
import { api } from '@/lib/api'
import type {
  Category, Document, Equipment, EquipmentKind, MaintenanceEvent, MaintenanceRule,
  Meter, Part, StorageLocation, WarrantyStatus,
} from '@/lib/types'

const KINDS: EquipmentKind[] = ['Asset', 'Tool', 'Both']
const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

const warrantyColor: Record<WarrantyStatus, string> = {
  Expired: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  ExpiringSoon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  Active: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  Unknown: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
}
const warrantyLabel: Record<WarrantyStatus, string> = {
  Expired: 'Expired', ExpiringSoon: 'Ending soon', Active: 'Active', Unknown: '—',
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { loading: authLoading, can } = useAuth()
  const [item, setItem] = useState<Equipment | null>(null)
  const [events, setEvents] = useState<MaintenanceEvent[]>([])
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [meters, setMeters] = useState<Meter[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  // Edit form
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<EquipmentKind>('Asset')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [storageLocationId, setStorageLocationId] = useState<string | null>(null)
  const [usedOnIds, setUsedOnIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [warranty, setWarranty] = useState<WarrantyValues>(EMPTY_WARRANTY)
  const [savingItem, setSavingItem] = useState(false)
  const [itemError, setItemError] = useState('')

  // Loan
  const [borrower, setBorrower] = useState('')
  const [loanBusy, setLoanBusy] = useState(false)

  const [deleting, setDeleting] = useState(false)

  function seed(e: Equipment) {
    setName(e.name); setKind(e.kind); setCategoryId(e.categoryId ?? null)
    setStorageLocationId(e.storageLocationId ?? null); setUsedOnIds(e.usedOn?.map(u => u.id) ?? []); setNotes(e.notes ?? '')
    setWarranty(warrantyFromEquipment(e))
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    Promise.all([api.equipment.get(id), api.events.list({ kind: 'equipment', id }), api.rules.list({ kind: 'equipment', id }),
      api.equipment.list(), api.categories.list(), api.storageLocations.list()])
      .then(([e, ev, r, all, cats, locs]) => {
        setItem(e); setEvents(ev); setRules(r); setAllEquipment(all); setCategories(cats); setLocations(locs); seed(e)
      })
      .finally(() => setLoading(false))
    api.parts.list({ equipmentId: id }).then(setParts).catch(() => {})
    api.documents.list({ equipmentId: id }).then(setDocuments).catch(() => {})
  }, [id])

  // Separate from the main load: meters need meters.read, which plenty of roles lack, and a
  // refusal must not take the rest of the page down with it.
  const canReadMeters = can('meters.read')
  useEffect(() => {
    if (authLoading || !canReadMeters) return
    api.meters.list(id).then(setMeters).catch(() => {})
  }, [id, authLoading, canReadMeters])

  // A reading moves a counter, and usage schedules' status is computed from it server-side.
  function reloadRules() {
    api.rules.list({ kind: 'equipment', id }).then(setRules).catch(() => {})
  }

  async function saveItem() {
    setSavingItem(true)
    setItemError('')
    try {
      const updated = await api.equipment.update(id, {
        name: name.trim(), kind,
        categoryId: categoryId || undefined,
        storageLocationId: storageLocationId || undefined,
        usedOnEquipmentIds: usedOnIds.length ? usedOnIds : undefined,
        notes: notes.trim() || undefined,
        imageUrl: item?.imageUrl,
        ...warrantyToDto(warranty),
      })
      setItem(updated); setEditing(false)
    } catch {
      // The API rejects a warranty period with nothing to count it from.
      setItemError('Could not save — check the purchase date and warranty period.')
    } finally { setSavingItem(false) }
  }

  async function checkout() {
    if (!borrower.trim()) return
    setLoanBusy(true)
    try { setItem(await api.equipment.checkout(id, borrower.trim())); setBorrower('') }
    finally { setLoanBusy(false) }
  }
  async function doReturn() {
    setLoanBusy(true)
    try { setItem(await api.equipment.return(id)) } finally { setLoanBusy(false) }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${item?.name}" and all its history? This cannot be undone.`)) return
    setDeleting(true)
    try { await api.equipment.delete(id); router.push(kind === 'Tool' ? '/tools' : '/assets') } catch { setDeleting(false) }
  }

  // can() is false while auth is in flight, so wait for it rather than painting a
  // read-only page at someone who may edit it.
  if (loading || authLoading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!item) return <div className="p-6 text-red-500 text-sm">Not found</div>

  const canEditItem = can('equipment.write')
  const canDeleteItem = can('equipment.delete')
  const canLend = can('equipment.lend')

  const logUrl = `${process.env.NEXT_PUBLIC_QR_BASE_URL || origin}/equipment/${id}/log`
  const loan = item.loans?.find(l => !l.returnedAt)
  const backHref = item.kind === 'Tool' ? '/tools' : '/assets'
  const relatedParts = parts
  const relatedEquipment = allEquipment.filter(e => e.usedOn?.some(u => u.id === id))

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-blue-500 text-sm">‹ Back</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate flex-1">{item.name}</h1>
        {canEditItem && (
          <button onClick={() => { setEditing(v => !v); seed(item) }} className="text-sm text-blue-500 font-medium">{editing ? 'Cancel' : 'Edit'}</button>
        )}
      </div>

      {editing ? (
        <div className={`${card} px-4 py-4 space-y-3`}>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Shows in</label>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(k => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`py-2 rounded-lg text-sm font-semibold border-2 ${kind === k
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {k === 'Asset' ? 'Assets' : k === 'Tool' ? 'Tools' : 'Both'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
            <EntityCombobox items={categories} value={categoryId} onChange={setCategoryId}
              onCreate={async (n) => { const c = await api.categories.create(n); setCategories(p => [...p, c]); return c }}
              allowCreate={can('categories.manage')}
              placeholder={can('categories.manage') ? 'Search or create…' : 'Search…'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stored at</label>
            <StorageLocationPicker value={storageLocationId} onChange={setStorageLocationId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Used on (optional)</label>
            <EquipmentMultiSelect equipment={allEquipment.filter(e => e.id !== id)} value={usedOnIds} onChange={setUsedOnIds} />
          </div>
          <WarrantyFields value={warranty} onChange={setWarranty} />
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="field" />
          </div>
          {itemError && <p className="text-sm text-red-500">{itemError}</p>}
          <button onClick={saveItem} disabled={savingItem} className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50">
            {savingItem ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      ) : (
        <div className={`${card} px-4 py-4 space-y-1`}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">Shows in:</span>{' '}
            {item.kind === 'Both' ? 'Assets & Tools' : item.kind === 'Tool' ? 'Tools' : 'Assets'}
          </p>
          {item.category && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Category:</span> {item.category.name}</p>}
          {item.storageLocationId && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Stored at:</span> {locationPath(item.storageLocationId, locations)}</p>}
          {item.usedOn && item.usedOn.length > 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">Used on:</span>{' '}
              {item.usedOn.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ', '}
                  <Link href={`/equipment/${u.id}`} className="text-blue-600 dark:text-blue-400">{u.name}</Link>
                </span>
              ))}
            </p>
          )}
          {item.purchasedAt && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Purchased:</span> {formatDate(item.purchasedAt)}</p>}
          {item.warrantyExpiresAt && (
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>
                <span className="font-medium text-slate-700 dark:text-slate-300">Warranty:</span>{' '}
                {item.warrantyStatus === 'Expired' ? 'expired' : 'until'} {formatDate(item.warrantyExpiresAt)}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${warrantyColor[item.warrantyStatus]}`}>
                {warrantyLabel[item.warrantyStatus]}
              </span>
            </p>
          )}
          {item.notes && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap pt-1">{item.notes}</p>}
          <p className="text-sm text-slate-400 dark:text-slate-500 pt-1">Added {formatDate(item.createdAt)}</p>
        </div>
      )}

      {/* Lending — who has it is worth reading without the right to lend, but the empty
          "Lend to…" box is nothing but a control, so it goes with the permission. */}
      {(loan || canLend) && (
        <div className={`${card} px-4 py-4`}>
          {loan ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Out on loan</p>
                <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{loan.borrower} <span className="text-slate-400 dark:text-slate-500">· since {formatDate(loan.loanedAt)}</span></p>
              </div>
              {canLend && (
                <button onClick={doReturn} disabled={loanBusy} className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">{loanBusy ? '…' : 'Return'}</button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="text" value={borrower} onChange={e => setBorrower(e.target.value)} placeholder="Lend to…" className="field flex-1"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); checkout() } }} />
              <button onClick={checkout} disabled={loanBusy || !borrower.trim()} className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-50">{loanBusy ? '…' : 'Check out'}</button>
            </div>
          )}
        </div>
      )}

      {/* Quick log CTA */}
      {can('events.create') && (
        <Link href={`/equipment/${id}/log`} className="block w-full bg-blue-600 text-white text-center font-semibold py-4 rounded-xl shadow text-lg">+ Log Maintenance</Link>
      )}

      <MaintenanceSchedule target={{ kind: 'equipment', id }} rules={rules} setRules={setRules} meters={meters} />

      {canReadMeters && <MeterList equipmentId={id} meters={meters} setMeters={setMeters} onChanged={reloadRules} />}

      {/* QR */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">QR Code</h2>
        <div className={`${card} p-5 flex flex-col items-center gap-2`}>
          {origin && <QRCodeSVG value={logUrl} size={160} bgColor="transparent" fgColor="currentColor" className="text-slate-900 dark:text-slate-100" />}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Scan to log maintenance</p>
        </div>
      </section>

      <MaintenanceHistory target={{ kind: 'equipment', id }} events={events} />

      {/* Related tools & parts */}
      {(relatedParts.length > 0 || relatedEquipment.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Related tools &amp; parts</h2>
          <ul className="space-y-2">
            {relatedEquipment.map((e) => (
              <li key={e.id}>
                <Link href={`/equipment/${e.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                  <span className="text-lg leading-none">🛠️</span>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{e.name}</span>
                  <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
                </Link>
              </li>
            ))}
            {relatedParts.map((p) => {
              const lowStock = p.minQuantity != null && p.quantity <= p.minQuantity
              return (
                <li key={p.id}>
                  <Link href={`/parts/${p.id}`} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                    <span className="text-lg leading-none">🔩</span>
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">{p.name}</span>
                    <span className={`text-sm font-semibold ${lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>{p.quantity} {p.unit}</span>
                    <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* External links (manual, spec sheet, repair video) */}
      <ExternalLinkList equipmentId={id} readOnly={!can('links.write')} />

      {/* Documents linked to this equipment */}
      {documents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Documents ({documents.length})</h2>
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className={`flex items-center gap-3 ${card} px-4 py-3`}>
                <span className="text-lg leading-none">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{d.title ?? d.fileName}</p>
                  {d.category && <p className="text-xs text-slate-400 dark:text-slate-500">{d.category.name}</p>}
                </div>
                <DocumentPreviewButton doc={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Delete */}
      {canDeleteItem && (
        <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <button onClick={handleDelete} disabled={deleting} className="w-full text-red-600 dark:text-red-400 font-medium py-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </section>
      )}
    </div>
  )
}
