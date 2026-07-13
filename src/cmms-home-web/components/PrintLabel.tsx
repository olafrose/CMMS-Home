import { QRCodeSVG } from 'qrcode.react'

export type QrPosition = 'auto' | 'left' | 'right' | 'top' | 'bottom' | 'none'
export type LabelAlign = 'auto' | 'left' | 'center'

// One printable label. It fills its parent cell (the /labels page sizes each cell
// in mm), so content is decoupled from the sheet/roll geometry. Layout is a table:
//
//   ┌──────────┬───────────────────────────┐
//   │          │ name (header, full width)  │
//   │ QR       ├──────────────────┬─────────┤
//   │ caption  │ location lines   │  icon   │  (icon bottom-aligned)
//   └──────────┴──────────────────┴─────────┘
//
// The name spans the full width of column 2, so it wraps at the label edge — never
// at the icon. Text auto-scales via a shared `fontScale` the page computes across
// all labels (height-driven, since the block is full width), so every label uses the
// SAME crisp size. Nothing is transform-scaled, so text stays sharp at its real size.
export interface PrintLabelProps {
  icon: string
  name: string
  /** Location detail lines, location first (e.g. ["Cellar", "Shelf A"]). Each truncates. */
  lines?: string[]
  caption?: string
  qrUrl: string
  /** Where the QR sits ('auto' should be pre-resolved by the caller). 'none' hides it. */
  qrPosition?: QrPosition
  /** Explicit QR edge in mm (0 = hidden). */
  qrEdgeMm?: number
  /** 'auto' = centered when QR is on top/bottom, else left. */
  align?: LabelAlign
  /** Show the caption under the QR (page decides based on label size). */
  showCaption?: boolean
  /** Uniform font multiplier applied across all labels (computed by the page). */
  fontScale?: number
  /** Optional second QR (e.g. maintenance quick-log) stacked with the primary. */
  secondaryQrUrl?: string
  secondaryCaption?: string
}

// Base sizes in mm — set the visual hierarchy; the page multiplies name/line sizes
// by a shared fontScale so all labels match.
const NAME_MM = 3.6
const LINE_MM = 2.4
const ICON_FALLBACK_MM = 6

export default function PrintLabel({
  icon, name, lines = [], caption, qrUrl,
  qrPosition = 'left', qrEdgeMm = 0, align = 'auto', showCaption = false, fontScale = 1,
  secondaryQrUrl, secondaryCaption,
}: PrintLabelProps) {
  const pos = qrPosition === 'auto' ? 'left' : qrPosition
  const showQr = pos !== 'none' && qrEdgeMm > 0
  const column = pos === 'top' || pos === 'bottom'
  const qrFirst = pos === 'top' || pos === 'left'
  const centered = align === 'auto' ? column : align === 'center'

  const locLines = lines.filter(Boolean)
  const s = fontScale
  const nameMm = NAME_MM * s
  const lineMm = LINE_MM * s
  const capMm = 2.1 * Math.min(Math.max(s, 1), 1.6)
  // Icon size tracks the label (via the QR size), NOT the text fit — otherwise a
  // large fontScale would balloon the icon and starve the location row of width.
  const iconMm = showQr ? Math.min(Math.max(qrEdgeMm * 0.4, 4), 10) : ICON_FALLBACK_MM

  // A single QR + optional caption block.
  const qrBlock = (value: string, cap?: string) => (
    <div className="flex flex-col items-center" style={{ gap: `${0.8 * s}mm`, maxWidth: '100%' }}>
      <div style={{ width: `${qrEdgeMm}mm`, height: `${qrEdgeMm}mm`, maxWidth: '100%' }}>
        <QRCodeSVG
          value={value}
          size={512}
          level="M"
          marginSize={2}
          fgColor="#000000"
          bgColor="#ffffff"
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
      {showCaption && cap && (
        <p style={{ fontSize: `${capMm}mm`, lineHeight: 1.15, color: '#6b7280', textAlign: 'center', maxWidth: `${qrEdgeMm}mm` }}>
          {cap}
        </p>
      )}
    </div>
  )

  // Column 1: primary QR (+ caption), plus an optional secondary QR stacked below.
  const qr = showQr && (
    <div className="shrink-0 flex flex-col items-center" style={{ gap: `${1.4 * s}mm`, maxWidth: '100%', maxHeight: '100%' }}>
      {qrBlock(qrUrl, caption)}
      {secondaryQrUrl && qrBlock(secondaryQrUrl, secondaryCaption)}
    </div>
  )

  // Column 2: name header over a [location lines | icon] row. Full width so the name
  // wraps at the label edge. `data-pl-cell` is what the page measures for fontScale.
  const col2 = (
    <div data-pl-cell className="flex-1 min-w-0 self-stretch overflow-hidden">
      <div data-pl-content style={{ width: '100%', textAlign: centered ? 'center' : 'left' }}>
        <p data-pl-name className="font-bold break-words" style={{ fontSize: `${nameMm}mm`, lineHeight: 1.1, minHeight: '2.2em' }}>{name}</p>
        <div className="flex items-start" style={{ gap: '1.5mm', marginTop: `${0.6 * s}mm`, minHeight: `${iconMm}mm` }}>
          <div className="min-w-0 flex-1">
            {locLines.map((l, i) => (
              <p key={i} className="truncate" style={{ fontSize: `${lineMm}mm`, lineHeight: 1.15, color: i === 0 ? '#374151' : '#6b7280' }}>
                {l}
              </p>
            ))}
          </div>
          <span className="shrink-0 self-end" style={{ fontSize: `${iconMm}mm`, lineHeight: 1 }}>{icon}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div
      className="w-full h-full box-border overflow-hidden bg-white text-black flex items-start"
      style={{
        padding: '2mm',
        gap: '2mm',
        flexDirection: column ? 'column' : 'row',
        border: '0.3mm solid #d1d5db',
        borderRadius: '1mm',
      }}
    >
      {qrFirst && qr}
      {col2}
      {!qrFirst && qr}
    </div>
  )
}
