'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { DocumentPreviewButton } from '@/components/DocumentPreview'
import EntityCombobox from '@/components/EntityCombobox'
import { categoryBadgeStyle } from '@/lib/documents'
import type { Equipment, Document, DocumentCategory, DocumentStatus, MaintenanceEvent, Part } from '@/lib/types'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Unclassified', label: 'Unclassified' },
  { value: 'Classified', label: 'Classified' },
  { value: 'Ignored', label: 'Ignored' },
  { value: 'Missing', label: 'Missing' },
  { value: '', label: 'All' },
]

const statusColor: Record<DocumentStatus, string> = {
  Unclassified: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  Classified: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  Ignored: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  Missing: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  PendingMove: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
}

// Mirrors the API's DocumentScanOptions.AllowedExtensions — used for the file
// picker's accept filter (server re-validates).
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.heic']

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// `target` carries its kind in the value — `eq:<id>` or `pt:<id>` — so one select covers
// equipment and parts. A separate kind toggle would cost an extra tap on a phone, and the
// two id spaces can't be told apart from the value alone.
const EQUIPMENT_PREFIX = 'eq:'
const PART_PREFIX = 'pt:'

interface LinkRow {
  target: string
  eventId: string
  events: MaintenanceEvent[]
  loadingEvents: boolean
}

// A factory, not a shared constant: rows are only ever replaced immutably today, but one
// shared object (and one shared `events` array) across every row is a trap worth not setting.
const emptyRow = (): LinkRow => ({ target: '', eventId: '', events: [], loadingEvents: false })

interface ClassifyFormProps {
  doc: Document
  equipment: Equipment[]
  parts: Part[]
  categories: DocumentCategory[]
  onClassified: (doc: Document) => void
  onCancel: () => void
}

function ClassifyForm({ doc, equipment, parts, categories, onClassified, onCancel }: ClassifyFormProps) {
  const [cats, setCats] = useState<DocumentCategory[]>(categories)
  const [categoryId, setCategoryId] = useState<string | null>(doc.categoryId ?? null)
  const [title, setTitle] = useState(doc.title ?? '')
  const [linkRows, setLinkRows] = useState<LinkRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function pickTarget(index: number, target: string) {
    // Only equipment has maintenance events to narrow to, so a part (or a cleared row)
    // drops the event select and whatever was loaded into it.
    const equipmentId = target.startsWith(EQUIPMENT_PREFIX) ? target.slice(EQUIPMENT_PREFIX.length) : ''
    if (!equipmentId) {
      setLinkRows(prev => prev.map((r, i) => i === index ? { ...r, target, eventId: '', events: [], loadingEvents: false } : r))
      return
    }
    setLinkRows(prev => prev.map((r, i) => i === index ? { ...r, target, eventId: '', loadingEvents: true } : r))
    try {
      const events = await api.events.list(equipmentId)
      setLinkRows(prev => prev.map((r, i) => i === index ? { ...r, events, loadingEvents: false } : r))
    } catch {
      setLinkRows(prev => prev.map((r, i) => i === index ? { ...r, events: [], loadingEvents: false } : r))
    }
  }

  function addRow() {
    setLinkRows(prev => [...prev, emptyRow()])
  }

  function removeRow(index: number) {
    setLinkRows(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validLinks = linkRows.filter(r => r.target)
    if (validLinks.length === 0) {
      setError('Add at least one link.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const updated = await api.documents.classify(doc.id, {
        categoryId: categoryId || undefined,
        title: title.trim() || undefined,
        // Each link is exactly one target: a part, or — for equipment — the event if one
        // was picked, else the equipment itself.
        links: validLinks.map(r => {
          if (r.target.startsWith(PART_PREFIX)) return { partId: r.target.slice(PART_PREFIX.length) }
          const equipmentId = r.target.slice(EQUIPMENT_PREFIX.length)
          return r.eventId ? { maintenanceEventId: r.eventId } : { equipmentId }
        }),
      })
      onClassified(updated)
    } catch {
      setError('Failed to classify. Please try again.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-blue-200 dark:border-blue-800 px-4 py-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
        <EntityCombobox
          items={cats}
          value={categoryId}
          onChange={setCategoryId}
          onCreate={async (name) => { const c = await api.documentCategories.create(name); setCats(prev => [...prev, c]); return c }}
          placeholder="Search or create…"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title (optional)</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Friendly label" className="field w-full" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Links *</label>
        <div className="space-y-2">
          {linkRows.map((row, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1.5">
                <select
                  value={row.target}
                  onChange={e => pickTarget(i, e.target.value)}
                  className="field w-full text-sm"
                >
                  <option value="">-- pick equipment or part --</option>
                  {equipment.length > 0 && (
                    <optgroup label="Equipment">
                      {equipment.map(a => <option key={a.id} value={`${EQUIPMENT_PREFIX}${a.id}`}>{a.name}</option>)}
                    </optgroup>
                  )}
                  {parts.length > 0 && (
                    <optgroup label="Parts">
                      {parts.map(p => <option key={p.id} value={`${PART_PREFIX}${p.id}`}>{p.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {row.target.startsWith(EQUIPMENT_PREFIX) && (
                  <select
                    value={row.eventId}
                    onChange={e => setLinkRows(prev => prev.map((r, idx) => idx === i ? { ...r, eventId: e.target.value } : r))}
                    className="field w-full text-sm"
                    disabled={row.loadingEvents}
                  >
                    <option value="">{row.loadingEvents ? 'Loading…' : 'No specific event'}</option>
                    {row.events.map(ev => (
                      <option key={ev.id} value={ev.id}>
                        {ev.type} — {formatDate(ev.createdAt)}{ev.note ? ` (${ev.note.slice(0, 30)})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {linkRows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} className="mt-1 text-slate-400 hover:text-red-500 text-lg leading-none" aria-label="Remove">×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addRow} className="text-xs text-blue-500 font-medium">+ Add another link</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg disabled:opacity-50 text-sm">
          {saving ? 'Saving…' : 'Classify'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium py-2 rounded-lg text-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

interface DocCardProps {
  doc: Document
  equipment: Equipment[]
  parts: Part[]
  categories: DocumentCategory[]
  onRemove: (id: string) => void
  onUpdate: (doc: Document) => void
}

function DocCard({ doc, equipment, parts, categories, onRemove, onUpdate }: DocCardProps) {
  const [classifying, setClassifying] = useState(false)
  const [ignoring, setIgnoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [unclassifying, setUnclassifying] = useState(false)

  async function handleDelete() {
    if (!confirm(`Remove "${doc.title ?? doc.fileName}" from the library? (The file on disk is not touched.)`)) return
    setDeleting(true)
    try {
      await api.documents.remove(doc.id)
      onRemove(doc.id)
    } catch {
      setDeleting(false)
    }
  }

  async function handleIgnore() {
    setIgnoring(true)
    try {
      await api.documents.ignore(doc.id)
      onRemove(doc.id)
    } catch {
      setIgnoring(false)
    }
  }

  async function handleUnclassify() {
    if (!confirm('Move this document back to the inbox and clear its classification?')) return
    setUnclassifying(true)
    try {
      const updated = await api.documents.unclassify(doc.id)
      onUpdate(updated)
    } catch {
      setUnclassifying(false)
    }
  }

  return (
    <li className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
            {doc.title ?? doc.fileName}
          </p>
          {doc.title && (
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{doc.fileName}</p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{doc.relativePath}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[doc.status]}`}>
            {doc.status}
          </span>
          {doc.category && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={categoryBadgeStyle(doc.category.color)}>
              {doc.category.name}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
        <span>{formatBytes(doc.sizeBytes)}</span>
        <span>·</span>
        <span>Modified {formatDate(doc.lastModifiedUtc)}</span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <DocumentPreviewButton doc={doc} />
        {(doc.status === 'Classified' || doc.status === 'PendingMove') && (
          <>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <button
              type="button"
              onClick={handleUnclassify}
              disabled={unclassifying}
              className="text-xs text-blue-500 font-medium disabled:opacity-50"
            >
              {unclassifying ? 'Moving…' : 'Move to inbox'}
            </button>
          </>
        )}
        {doc.status === 'Unclassified' && (
          <>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <button
              type="button"
              onClick={() => setClassifying(v => !v)}
              className="text-xs text-blue-500 font-medium"
            >
              {classifying ? 'Cancel classify' : 'Classify'}
            </button>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <button
              type="button"
              onClick={handleIgnore}
              disabled={ignoring}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 disabled:opacity-50"
            >
              {ignoring ? 'Ignoring…' : 'Ignore'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 disabled:opacity-50"
        >
          {deleting ? 'Removing…' : 'Delete'}
        </button>
      </div>
      {classifying && (
        <ClassifyForm
          doc={doc}
          equipment={equipment}
          parts={parts}
          categories={categories}
          onClassified={(updated) => { onUpdate(updated); setClassifying(false) }}
          onCancel={() => setClassifying(false)}
        />
      )}
    </li>
  )
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [statusFilter, setStatusFilter] = useState('Unclassified')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [pruning, setPruning] = useState(false)
  const [scanSummary, setScanSummary] = useState<{ discovered: number; updated: number; missing: number; total: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function loadDocs(status: string) {
    setLoading(true)
    api.documents.list(status ? { status } : undefined)
      .then(setDocs)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.equipment.list().then(setEquipment).catch(() => {})
    // Separately caught: losing parts leaves the classify picker with its Equipment half
    // rather than no picker at all.
    api.parts.list().then(setParts).catch(() => {})
    api.documentCategories.list().then(setCategories).catch(() => {})
    loadDocs(statusFilter)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatusChange(value: string) {
    setStatusFilter(value)
    loadDocs(value)
  }

  async function handleRescan() {
    setScanning(true)
    setScanSummary(null)
    try {
      const summary = await api.documents.scan()
      setScanSummary(summary)
      loadDocs(statusFilter)
      window.dispatchEvent(new Event('documents:changed'))
    } catch {
      setScanning(false)
    } finally {
      setScanning(false)
    }
  }

  function handleRemove(id: string) {
    setDocs(prev => prev.filter(d => d.id !== id))
    window.dispatchEvent(new Event('documents:changed'))
  }

  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    setUploadError(null)
    let failed = 0
    for (const f of list) {
      try { await api.documents.upload(f) }
      catch { failed++ }
    }
    // Uploads land in the inbox as Unclassified; show them by switching to that filter.
    setStatusFilter('Unclassified')
    loadDocs('Unclassified')
    window.dispatchEvent(new Event('documents:changed'))
    if (failed > 0) setUploadError(`${failed} of ${list.length} file(s) failed to upload.`)
    setUploading(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files)
  }

  async function handlePruneMissing() {
    if (!confirm('Remove all documents whose files are no longer on disk? (Files are not touched.)')) return
    setPruning(true)
    try {
      await api.documents.pruneMissing()
      loadDocs(statusFilter)
      window.dispatchEvent(new Event('documents:changed'))
    } finally {
      setPruning(false)
    }
  }

  function handleUpdate(updated: Document) {
    // Drop the doc from the list if it no longer matches the active filter
    // (e.g. classify from Unclassified, or un-classify from Classified). '' = All.
    const matchesFilter = !statusFilter || updated.status === statusFilter
    setDocs(prev => matchesFilter
      ? prev.map(d => d.id === updated.id ? updated : d)
      : prev.filter(d => d.id !== updated.id))
    window.dispatchEvent(new Event('documents:changed'))
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Documents</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = '' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : '⬆ Upload'}
          </button>
          <button
            onClick={handleRescan}
            disabled={scanning}
            className="text-sm font-semibold px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 disabled:opacity-50"
          >
            {scanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {uploadError}
        </div>
      )}

      {scanSummary && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300">
          Scan complete: {scanSummary.discovered} discovered, {scanSummary.updated} updated, {scanSummary.missing} missing, {scanSummary.total} total.
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleStatusChange(opt.value)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === opt.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!loading && statusFilter === 'Missing' && docs.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={handlePruneMissing}
            disabled={pruning}
            className="text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-full px-3 py-1.5 disabled:opacity-50"
          >
            {pruning ? 'Removing…' : `Remove all missing (${docs.length})`}
          </button>
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={e => { e.preventDefault(); setDragging(false) }}
        onDrop={onDrop}
        className={dragging ? 'rounded-xl ring-2 ring-blue-400 ring-dashed bg-blue-50/50 dark:bg-blue-900/10' : ''}
      >
        {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

        {!loading && docs.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">📄</p>
            <p className="font-medium">No documents</p>
            <p className="text-sm mt-1">
              {statusFilter === 'Unclassified'
                ? 'Tap Upload (or drop files here) — or drop them on the NAS share and tap Rescan.'
                : 'Nothing to show for this filter.'}
            </p>
          </div>
        )}

        {!loading && docs.length > 0 && (
          <ul className="space-y-3">
            {docs.map(doc => (
              <DocCard
                key={doc.id}
                doc={doc}
                equipment={equipment}
                parts={parts}
                categories={categories}
                onRemove={handleRemove}
                onUpdate={handleUpdate}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
