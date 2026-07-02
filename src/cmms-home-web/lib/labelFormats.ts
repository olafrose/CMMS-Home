// Physical label-sheet / roll definitions used by the /labels print builder.
// Sheet formats carry a full grid spec (page + margins + gaps) so the printed
// grid can register exactly onto a real peel-and-stick label sheet; the user can
// nudge any value on the page to calibrate. Roll formats print one label per page.

export type PageSize = 'A4' | 'Letter'

// Physical page dimensions in millimetres (portrait).
export const PAGE_DIMENSIONS_MM: Record<PageSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
}

export interface SheetFormat {
  id: string
  label: string
  group: string
  kind: 'sheet'
  page: PageSize
  columns: number
  rows: number
  labelWidthMm: number
  labelHeightMm: number
  marginTopMm: number
  marginLeftMm: number
  gapXMm: number
  gapYMm: number
}

export interface RollFormat {
  id: string
  label: string
  group: string
  kind: 'roll'
  labelWidthMm: number
  labelHeightMm: number
}

export type LabelFormat = SheetFormat | RollFormat

// Mutable layout state edited on the page. Mirrors SheetFormat's geometry plus a
// `kind`/`page` so a single object drives both sheet and roll rendering.
export interface LabelLayout {
  kind: 'sheet' | 'roll'
  page: PageSize
  columns: number
  rows: number
  labelWidthMm: number
  labelHeightMm: number
  marginTopMm: number
  marginLeftMm: number
  gapXMm: number
  gapYMm: number
}

const A4 = 'Plain paper · A4 (DIN)'
const LETTER = 'Plain paper · Letter (US)'
const CUSTOM = 'Custom'
const ROLL = 'Label printer (roll)'

// Preset geometry values are close to the real products; exact registration is
// achieved by printing a test sheet and adjusting the numbers on the page.
export const LABEL_FORMATS: LabelFormat[] = [
  // A4 sheets (DIN)
  {
    id: 'avery-l7160', label: 'Avery L7160 · 63.5×38.1 mm (21/sheet)', group: A4, kind: 'sheet',
    page: 'A4', columns: 3, rows: 7, labelWidthMm: 63.5, labelHeightMm: 38.1,
    marginTopMm: 15.1, marginLeftMm: 7.2, gapXMm: 2.5, gapYMm: 0,
  },
  {
    id: 'avery-3474', label: 'Avery 3474 · 70×37 mm (24/sheet)', group: A4, kind: 'sheet',
    page: 'A4', columns: 3, rows: 8, labelWidthMm: 70, labelHeightMm: 37,
    marginTopMm: 0.5, marginLeftMm: 0, gapXMm: 0, gapYMm: 0,
  },
  {
    id: 'avery-l7173', label: 'Avery L7173 · 99.1×57 mm (10/sheet)', group: A4, kind: 'sheet',
    page: 'A4', columns: 2, rows: 5, labelWidthMm: 99.1, labelHeightMm: 57,
    marginTopMm: 6, marginLeftMm: 4.65, gapXMm: 2.5, gapYMm: 0,
  },
  // Letter sheets (US)
  {
    id: 'avery-5160', label: 'Avery 5160 · 66.7×25.4 mm (30/sheet)', group: LETTER, kind: 'sheet',
    page: 'Letter', columns: 3, rows: 10, labelWidthMm: 66.7, labelHeightMm: 25.4,
    marginTopMm: 12.7, marginLeftMm: 4.8, gapXMm: 3.2, gapYMm: 0,
  },
  {
    id: 'avery-5163', label: 'Avery 5163 · 101.6×50.8 mm (10/sheet)', group: LETTER, kind: 'sheet',
    page: 'Letter', columns: 2, rows: 5, labelWidthMm: 101.6, labelHeightMm: 50.8,
    marginTopMm: 12.7, marginLeftMm: 4.75, gapXMm: 3.2, gapYMm: 0,
  },
  // Custom starting point
  {
    id: 'custom', label: 'Custom sheet…', group: CUSTOM, kind: 'sheet',
    page: 'A4', columns: 3, rows: 8, labelWidthMm: 60, labelHeightMm: 30,
    marginTopMm: 10, marginLeftMm: 10, gapXMm: 3, gapYMm: 3,
  },
  // Label-printer rolls (one label per page)
  { id: 'brother-dk11209', label: 'Brother DK-11209 · 62×29 mm', group: ROLL, kind: 'roll', labelWidthMm: 62, labelHeightMm: 29 },
  { id: 'brother-dk11201', label: 'Brother DK-11201 · 29×90 mm', group: ROLL, kind: 'roll', labelWidthMm: 29, labelHeightMm: 90 },
  { id: 'dymo-99012', label: 'Dymo 99012 · 89×36 mm', group: ROLL, kind: 'roll', labelWidthMm: 89, labelHeightMm: 36 },
  { id: 'dymo-99010', label: 'Dymo 99010 · 89×28 mm', group: ROLL, kind: 'roll', labelWidthMm: 89, labelHeightMm: 28 },
]

// Distinct group names in display order, for building the <optgroup> picker.
export const LABEL_FORMAT_GROUPS: string[] = LABEL_FORMATS.reduce<string[]>((groups, f) => {
  if (!groups.includes(f.group)) groups.push(f.group)
  return groups
}, [])

// Build the editable layout object from a chosen preset.
export function layoutFromFormat(f: LabelFormat): LabelLayout {
  if (f.kind === 'roll') {
    return {
      kind: 'roll', page: 'A4', columns: 1, rows: 1,
      labelWidthMm: f.labelWidthMm, labelHeightMm: f.labelHeightMm,
      marginTopMm: 0, marginLeftMm: 0, gapXMm: 0, gapYMm: 0,
    }
  }
  return {
    kind: 'sheet', page: f.page, columns: f.columns, rows: f.rows,
    labelWidthMm: f.labelWidthMm, labelHeightMm: f.labelHeightMm,
    marginTopMm: f.marginTopMm, marginLeftMm: f.marginLeftMm,
    gapXMm: f.gapXMm, gapYMm: f.gapYMm,
  }
}
