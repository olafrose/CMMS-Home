'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { AppSettings, Equipment, StorageLocation } from '@/lib/types'
import { locationPath, formatLocationPath, DEFAULT_LOCATION_ICON } from '@/lib/storage'
import PrintLabel, { type QrPosition, type LabelAlign } from '@/components/PrintLabel'
import {
  LABEL_FORMATS, LABEL_FORMAT_GROUPS, PAGE_DIMENSIONS_MM,
  layoutFromFormat, type LabelLayout,
} from '@/lib/labelFormats'

type Kind = 'equipment' | 'place'

interface LabelItem {
  key: string
  kind: Kind
  icon: string
  name: string
  lines: string[] // location detail, location first
  caption: string
  qrUrl: string
  /** Optional maintenance quick-log target (equipment only), for the secondary QR. */
  maintenanceUrl?: string
}

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'
const MM = 3.7795275591 // CSS px per mm at 96dpi — for the on-screen preview
const QR_MAX_MM = 30

// Arrangement of elements on the label (applies to the whole print run).
interface LabelDesign {
  qrPosition: QrPosition
  qrSizeMm: number // 0 = auto (capped at QR_MAX_MM)
  align: LabelAlign
  maintenanceQr: boolean // add a 2nd "quick-log" QR to equipment labels (large labels only)
}
const DEFAULT_DESIGN: LabelDesign = { qrPosition: 'auto', qrSizeMm: 0, align: 'auto', maintenanceQr: false }
// A label needs at least this on its short edge to fit two stacked QRs legibly.
const MAINT_QR_MIN_MM = 40

function pill(active: boolean) {
  return `px-2.5 py-1 rounded-full text-sm font-medium ${
    active ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
  }`
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size < 1) return arr.length ? [arr] : []
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function NumField({ label, value, onChange, step = 0.1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="number" value={value} min={min} step={step}
        onChange={e => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
        className="field text-sm py-2"
      />
    </label>
  )
}

export default function LabelsPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [places, setPlaces] = useState<StorageLocation[]>([])
  const [settings, setSettings] = useState<AppSettings>()
  const [labelTokens, setLabelTokens] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState('')
  const [onlyKey, setOnlyKey] = useState<string | null>(null)

  const [formatId, setFormatId] = useState<string>(LABEL_FORMATS[0].id)
  const [layout, setLayout] = useState<LabelLayout>(layoutFromFormat(LABEL_FORMATS[0]))
  const [customized, setCustomized] = useState(false)
  const [design, setDesign] = useState<LabelDesign>(DEFAULT_DESIGN)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectionOpen, setSelectionOpen] = useState(true)

  // Shared crisp font size across all labels (sized so the longest name fits).
  const previewRef = useRef<HTMLDivElement | null>(null)
  const fontScaleRef = useRef(1)
  const [fontScale, setFontScale] = useState(1)
  const fitSigRef = useRef('')   // inputs (other than fontScale) that trigger a fresh fit
  const fitStepRef = useRef(0)   // iteration budget, so wrapping ping-pong can't loop forever

  // Read ?only=<kind>:<id> without useSearchParams (avoids the Suspense boundary),
  // matching how the other pages read window.location.
  useEffect(() => {
    setOrigin(window.location.origin)
    const only = new URLSearchParams(window.location.search).get('only')
    if (only && /^(equipment|place):/.test(only)) setOnlyKey(only)
    // Restore last-used format + arrangement.
    try {
      const savedFmt = localStorage.getItem('labels.formatId')
      const f = savedFmt ? LABEL_FORMATS.find(x => x.id === savedFmt) : undefined
      if (f) { setFormatId(f.id); setLayout(layoutFromFormat(f)) }
      const savedDesign = localStorage.getItem('labels.design')
      if (savedDesign) setDesign({ ...DEFAULT_DESIGN, ...JSON.parse(savedDesign) })
    } catch { /* localStorage unavailable */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('labels.design', JSON.stringify(design)) } catch { /* ignore */ }
  }, [design])
  useEffect(() => {
    try { localStorage.setItem('labels.formatId', formatId) } catch { /* ignore */ }
  }, [formatId])

  useEffect(() => {
    Promise.all([
      api.equipment.list(),
      api.storageLocations.list(),
      api.appSettings.get(),
      // The signed per-item tokens the QR codes carry. Not fatal if refused — a label
      // without one still works for anyone signed in, which beats printing nothing.
      api.auth.labelTokens().catch(() => ({} as Record<string, string>)),
    ])
      .then(([eq, p, s, t]) => { setEquipment(eq); setPlaces(p); setSettings(s); setLabelTokens(t) })
      .finally(() => setLoading(false))
  }, [])

  const qrBase = process.env.NEXT_PUBLIC_QR_BASE_URL || origin

  // The location line is the breadcrumb shortened per the user's policy, not just the
  // leaf place name — "Bin 3" alone doesn't tell you which cabinet to walk to. Keeping it
  // short matters here specifically: fontScale is fitted once across the WHOLE print run,
  // so one deeply-nested item printing its full chain would shrink text on every label.
  const equipmentItems = useMemo<LabelItem[]>(() => equipment.map(e => {
    // The token is what authorises an anonymous scan of this one item. Omitted rather than
    // faked when we don't have one: a `?t=` the server will reject is worse than a label
    // that simply asks whoever scans it to sign in.
    const token = labelTokens[e.id]
    const q = token ? `?t=${encodeURIComponent(token)}` : ''
    return {
      key: `equipment:${e.id}`, kind: 'equipment', icon: e.kind === 'Tool' ? '🛠️' : '🔧', name: e.name,
      lines: [e.category?.name, formatLocationPath(e.storageLocationId, places, settings)].filter(Boolean) as string[],
      caption: 'Open',
      qrUrl: `${qrBase}/equipment/${e.id}${q}`,
      maintenanceUrl: `${qrBase}/equipment/${e.id}/log${q}`,
    }
  }), [equipment, places, settings, qrBase, labelTokens])

  // Every storage location is a printable label; the subtitle is its ancestor breadcrumb.
  // Deliberately the FULL lineage via locationPath (not the shortened formatLocationPath):
  // a place's own label should say exactly where that place is. Only *references* to a
  // location get shortened — don't "fix" this into uniformity.
  const placeItems = useMemo<LabelItem[]>(() => places.map(p => {
    const ancestors = locationPath(p.parentId, places)
    return {
      key: `place:${p.id}`, kind: 'place', icon: p.icon || DEFAULT_LOCATION_ICON, name: p.name,
      lines: ancestors ? [ancestors] : [],
      caption: 'Contents',
      qrUrl: `${qrBase}/storage/${p.id}`,
    }
  }), [places, qrBase])

  const itemsByKey = useMemo(() => {
    const m = new Map<string, LabelItem>()
    for (const it of [...equipmentItems, ...placeItems]) m.set(it.key, it)
    return m
  }, [equipmentItems, placeItems])

  // Default selection once data is loaded: everything, or just the preselected item.
  useEffect(() => {
    if (loading) return
    if (onlyKey) {
      setSelected(itemsByKey.has(onlyKey) ? new Set([onlyKey]) : new Set())
    } else {
      setSelected(new Set(itemsByKey.keys()))
    }
  }, [loading, onlyKey, itemsByKey])

  function pickFormat(id: string) {
    const f = LABEL_FORMATS.find(x => x.id === id) ?? LABEL_FORMATS[0]
    setFormatId(id)
    setLayout(layoutFromFormat(f))
    setCustomized(false)
  }

  function editLayout(patch: Partial<LabelLayout>) {
    setLayout(prev => ({ ...prev, ...patch }))
    setCustomized(true)
  }

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function setMany(keys: string[], on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const k of keys) { if (on) next.add(k); else next.delete(k) }
      return next
    })
  }

  // Places listed with their full path, ordered so parents precede children.
  const placeRows = useMemo(
    () => places
      .map(p => ({ item: placeItems.find(i => i.key === `place:${p.id}`)!, path: locationPath(p.id, places) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    [places, placeItems],
  )

  const selectedItems = useMemo(
    () => [...itemsByKey.values()].filter(it => selected.has(it.key)),
    [itemsByKey, selected],
  )

  // Geometry for rendering + print.
  const isRoll = layout.kind === 'roll'
  const pageDim = isRoll
    ? { widthMm: layout.labelWidthMm, heightMm: layout.labelHeightMm }
    : PAGE_DIMENSIONS_MM[layout.page]
  const perPage = isRoll ? 1 : Math.max(1, layout.columns * layout.rows)
  const pages = chunk(selectedItems, perPage)

  const pageCss = isRoll
    ? `@page { size: ${layout.labelWidthMm}mm ${layout.labelHeightMm}mm; margin: 0; }`
    : `@page { size: ${layout.page === 'A4' ? 'A4' : 'letter'}; margin: 0; }`

  // Resolve an 'auto' QR position from the (uniform) label aspect ratio.
  const qrPosition = design.qrPosition === 'auto'
    ? (layout.labelHeightMm > layout.labelWidthMm ? 'top' : 'left')
    : design.qrPosition

  // Explicit QR size + whether the caption fits under it, from the (uniform) geometry.
  const qrColumn = qrPosition === 'top' || qrPosition === 'bottom'
  const qrCapMm = design.qrSizeMm > 0 ? design.qrSizeMm : QR_MAX_MM
  const showCaption = qrPosition !== 'none' && Math.min(layout.labelWidthMm, layout.labelHeightMm) >= 34
  // Second (maintenance) QR only on large enough labels, and only for equipment.
  const twoQr = design.maintenanceQr && qrPosition !== 'none'
    && Math.min(layout.labelWidthMm, layout.labelHeightMm) >= MAINT_QR_MIN_MM
  let qrEdgeMm = qrPosition === 'none'
    ? 0
    : Math.max(8, Math.min(
        qrCapMm,
        (qrColumn ? layout.labelWidthMm : layout.labelHeightMm) - 4 - (!qrColumn && showCaption ? 5 : 0),
      ))
  // Two QRs stack vertically in the QR area — shrink each so both + captions fit the height.
  if (twoQr) {
    const captionAllow = showCaption ? 6 : 0
    qrEdgeMm = Math.max(10, Math.min(qrEdgeMm, (layout.labelHeightMm - 4 - 2 * captionAllow - 2) / 2))
  }

  // One shared font size for the whole run: measure every label's content against
  // its cell and take the tightest fit, so all labels render at the same crisp size.
  // We compare the content's natural (scroll) size to the cell so overflow is
  // actually detected, and iterate (fontScale is a dep) since wrapping is nonlinear.
  useLayoutEffect(() => {
    const root = previewRef.current
    if (!root) return
    const cells = root.querySelectorAll<HTMLElement>('[data-pl-cell]')
    if (!cells.length) return
    // Reset the iteration budget whenever the inputs (other than fontScale) change;
    // otherwise stop after a few passes so discrete line-wrapping can't ping-pong forever.
    const sig = `${selectedItems.length}|${JSON.stringify(layout)}|${JSON.stringify(design)}|${origin}`
    if (sig !== fitSigRef.current) { fitSigRef.current = sig; fitStepRef.current = 0 }
    if (fitStepRef.current > 10) return
    let ratio = Infinity
    cells.forEach(cell => {
      const content = cell.querySelector<HTMLElement>('[data-pl-content]')
      if (!content) return
      const W = cell.clientWidth, H = cell.clientHeight
      // Name width: measure the longest WORD (min-content) so the font scales down only
      // far enough that no word is broken — the name may still wrap across words.
      // Height keeps the whole block from overflowing.
      const nameEl = cell.querySelector<HTMLElement>('[data-pl-name]')
      let wordW = 0
      if (nameEl) {
        const prev = nameEl.style.width
        nameEl.style.width = 'min-content'
        wordW = nameEl.offsetWidth
        nameEl.style.width = prev
      }
      const ch = content.scrollHeight
      if (!W || !H || !ch) return
      const rw = wordW ? W / wordW : Infinity
      ratio = Math.min(ratio, rw, H / ch)
    })
    if (ratio === Infinity || (ratio > 0.97 && ratio < 1.03)) return
    const next = Math.max(0.5, Math.min(4, fontScaleRef.current * Math.pow(ratio, 0.7)))
    if (Math.abs(next - fontScaleRef.current) > 0.01) {
      fitStepRef.current += 1
      fontScaleRef.current = next
      setFontScale(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, layout, design, origin, fontScale])

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-4">
      {/* Dynamic @page — cannot be a static class */}
      <style media="print">{pageCss}</style>

      <div className="no-print">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/assets" className="text-blue-500 text-sm">‹ Back</Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Print Labels</h1>
          <button
            onClick={() => window.print()}
            disabled={selectedItems.length === 0}
            className="ml-auto bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-50"
          >
            🖨️ Print ({selectedItems.length})
          </button>
        </div>

        {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}

        {/* Format + layout */}
        {!loading && (
          <section className={`${card} p-4 mb-6 space-y-4`}>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Label format</label>
              <select value={formatId} onChange={e => pickFormat(e.target.value)} className="field text-sm">
                {LABEL_FORMAT_GROUPS.map(group => (
                  <optgroup key={group} label={group}>
                    {LABEL_FORMATS.filter(f => f.group === group).map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {isRoll ? (
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Label width (mm)" value={layout.labelWidthMm} onChange={v => editLayout({ labelWidthMm: v })} />
                <NumField label="Label height (mm)" value={layout.labelHeightMm} onChange={v => editLayout({ labelHeightMm: v })} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Page</span>
                  {(['A4', 'Letter'] as const).map(p => (
                    <button key={p} onClick={() => editLayout({ page: p })}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        layout.page === p ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>{p}</button>
                  ))}
                  {customized && (
                    <button onClick={() => pickFormat(formatId)} className="ml-auto text-xs text-blue-500 underline">
                      Reset to preset
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <NumField label="Columns" value={layout.columns} onChange={v => editLayout({ columns: Math.max(1, Math.round(v)) })} step={1} min={1} />
                  <NumField label="Rows" value={layout.rows} onChange={v => editLayout({ rows: Math.max(1, Math.round(v)) })} step={1} min={1} />
                  <NumField label="Label width (mm)" value={layout.labelWidthMm} onChange={v => editLayout({ labelWidthMm: v })} />
                  <NumField label="Label height (mm)" value={layout.labelHeightMm} onChange={v => editLayout({ labelHeightMm: v })} />
                  <NumField label="Top margin (mm)" value={layout.marginTopMm} onChange={v => editLayout({ marginTopMm: v })} />
                  <NumField label="Left margin (mm)" value={layout.marginLeftMm} onChange={v => editLayout({ marginLeftMm: v })} />
                  <NumField label="H gap (mm)" value={layout.gapXMm} onChange={v => editLayout({ gapXMm: v })} />
                  <NumField label="V gap (mm)" value={layout.gapYMm} onChange={v => editLayout({ gapYMm: v })} />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Tip: print one test page on plain paper, lay it over your label sheet, and nudge the margins/gaps until the boxes line up.
                </p>
              </>
            )}

            {/* Element arrangement (applies to every label) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-20">QR position</span>
                {(['auto', 'left', 'right', 'top', 'bottom', 'none'] as QrPosition[]).map(p => (
                  <button key={p} onClick={() => setDesign(d => ({ ...d, qrPosition: p }))} className={pill(design.qrPosition === p)}>
                    {p === 'auto' ? 'Auto' : p === 'none' ? 'None' : p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
                {(design.qrPosition !== DEFAULT_DESIGN.qrPosition || design.qrSizeMm !== 0 || design.align !== 'auto') && (
                  <button onClick={() => setDesign(DEFAULT_DESIGN)} className="ml-auto text-xs text-blue-500 underline">
                    Reset layout
                  </button>
                )}
              </div>

              {design.qrPosition !== 'none' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-20">QR size</span>
                  <button onClick={() => setDesign(d => ({ ...d, qrSizeMm: 0 }))} className={pill(design.qrSizeMm === 0)}>Auto</button>
                  <input type="range" min={12} max={QR_MAX_MM} step={1} value={design.qrSizeMm || 24}
                    onChange={e => setDesign(d => ({ ...d, qrSizeMm: parseInt(e.target.value) }))}
                    className="flex-1 accent-blue-600" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 w-12 text-right">
                    {design.qrSizeMm ? `${design.qrSizeMm}mm` : 'auto'}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-20">Text align</span>
                {(['auto', 'left', 'center'] as LabelAlign[]).map(a => (
                  <button key={a} onClick={() => setDesign(d => ({ ...d, align: a }))} className={pill(design.align === a)}>
                    {a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>

              {design.qrPosition !== 'none' && (
                <label className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={design.maintenanceQr}
                    onChange={e => setDesign(d => ({ ...d, maintenanceQr: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600 mt-0.5"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    Add a maintenance quick-log QR to equipment labels
                    <span className="block text-slate-400 dark:text-slate-500">
                      Second QR (→ log) on labels at least {MAINT_QR_MIN_MM}mm on the short edge.
                      {design.maintenanceQr && !twoQr && ' Current label is too small — not shown.'}
                    </span>
                  </span>
                </label>
              )}
            </div>
          </section>
        )}

        {/* Selection */}
        {!loading && (
          <section className="space-y-5 mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectionOpen(v => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <span className="text-slate-400 dark:text-slate-500 text-xs">{selectionOpen ? '▾' : '▸'}</span>
                Items ({selectedItems.length} selected)
              </button>
              <button onClick={() => setMany([...itemsByKey.keys()], true)} className="ml-auto text-xs text-blue-500 underline">All</button>
              <button onClick={() => setMany([...itemsByKey.keys()], false)} className="text-xs text-blue-500 underline">None</button>
            </div>

            {selectionOpen && (
              <>
                <SelectSection title="🔧 Equipment" items={equipmentItems} selected={selected} onToggle={toggle} onSetMany={setMany} />

                {placeItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">🧊 Places</p>
                      <button onClick={() => setMany(placeItems.map(i => i.key), true)} className="ml-auto text-xs text-blue-500 underline">All</button>
                      <button onClick={() => setMany(placeItems.map(i => i.key), false)} className="text-xs text-blue-500 underline">None</button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1">
                      {placeRows.map(({ item, path }) => (
                        <PlaceRow key={item.key} item={item} path={path} checked={selected.has(item.key)} onToggle={toggle} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Preview + print output */}
      {!loading && origin && (
        <div>
          {selectedItems.length === 0 ? (
            <p className="no-print text-sm text-slate-400 dark:text-slate-500">Select at least one item to preview labels.</p>
          ) : (
            <div className="overflow-x-auto" ref={previewRef}>
              {pages.map((pageItems, pi) => (
                <div
                  key={pi}
                  className="label-page"
                  style={{
                    width: `${pageDim.widthMm * MM}px`,
                    height: `${pageDim.heightMm * MM}px`,
                    boxSizing: 'border-box',
                    paddingTop: isRoll ? 0 : `${layout.marginTopMm * MM}px`,
                    paddingLeft: isRoll ? 0 : `${layout.marginLeftMm * MM}px`,
                    display: 'grid',
                    gridTemplateColumns: isRoll
                      ? '1fr'
                      : `repeat(${layout.columns}, ${layout.labelWidthMm * MM}px)`,
                    gridAutoRows: `${layout.labelHeightMm * MM}px`,
                    columnGap: isRoll ? 0 : `${layout.gapXMm * MM}px`,
                    rowGap: isRoll ? 0 : `${layout.gapYMm * MM}px`,
                  }}
                >
                  {pageItems.map(it => (
                    <PrintLabel
                      key={it.key}
                      icon={it.icon}
                      name={it.name}
                      lines={it.lines}
                      caption={it.caption}
                      qrUrl={it.qrUrl}
                      qrPosition={qrPosition}
                      qrEdgeMm={qrEdgeMm}
                      align={design.align}
                      showCaption={showCaption}
                      fontScale={fontScale}
                      secondaryQrUrl={twoQr && it.kind === 'equipment' ? it.maintenanceUrl : undefined}
                      secondaryCaption="Log"
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, checked, onToggle }: { item: LabelItem; checked: boolean; onToggle: (k: string) => void }) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={() => onToggle(item.key)} className="w-4 h-4 accent-blue-600" />
      <span className="text-sm text-slate-700 dark:text-slate-200 truncate flex-1">{item.name}</span>
      {item.lines.length > 0 && <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[45%]">{item.lines.join(' · ')}</span>}
    </label>
  )
}

function PlaceRow({ item, path, checked, onToggle }: {
  item: LabelItem; path: string; checked: boolean; onToggle: (k: string) => void
}) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={() => onToggle(item.key)} className="w-4 h-4 accent-blue-600" />
      <span className="text-sm text-slate-700 dark:text-slate-200 truncate flex-1">{path || item.name}</span>
    </label>
  )
}

function SelectSection({ title, items, selected, onToggle, onSetMany }: {
  title: string
  items: LabelItem[]
  selected: Set<string>
  onToggle: (k: string) => void
  onSetMany: (keys: string[], on: boolean) => void
}) {
  if (items.length === 0) return null
  const keys = items.map(i => i.key)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</p>
        <button onClick={() => onSetMany(keys, true)} className="ml-auto text-xs text-blue-500 underline">All</button>
        <button onClick={() => onSetMany(keys, false)} className="text-xs text-blue-500 underline">None</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-1">
        {items.map(it => <ItemRow key={it.key} item={it} checked={selected.has(it.key)} onToggle={onToggle} />)}
      </div>
    </div>
  )
}
