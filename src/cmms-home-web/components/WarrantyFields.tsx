'use client'

import type { Equipment } from '@/lib/types'

// Purchase date + warranty inputs, shared by the create form and the detail-page edit
// form. Values are kept as raw input strings (yyyy-mm-dd / digits) and converted at the
// edges, so a half-typed field never becomes a bogus date.
export interface WarrantyValues {
  purchasedAt: string
  warrantyMonths: string
  warrantyUntil: string
}

export const EMPTY_WARRANTY: WarrantyValues = { purchasedAt: '', warrantyMonths: '', warrantyUntil: '' }

// Stored at midnight UTC, so slicing the ISO string yields the right calendar day.
const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '')

export function warrantyFromEquipment(e?: Equipment): WarrantyValues {
  if (!e) return EMPTY_WARRANTY
  return {
    purchasedAt: toDateInput(e.purchasedAt),
    warrantyMonths: e.warrantyMonths != null ? String(e.warrantyMonths) : '',
    warrantyUntil: toDateInput(e.warrantyUntil),
  }
}

export function warrantyToDto(v: WarrantyValues) {
  const months = parseInt(v.warrantyMonths, 10)
  return {
    purchasedAt: v.purchasedAt ? new Date(v.purchasedAt).toISOString() : undefined,
    warrantyMonths: Number.isFinite(months) && months > 0 ? months : undefined,
    warrantyUntil: v.warrantyUntil ? new Date(v.warrantyUntil).toISOString() : undefined,
  }
}

export default function WarrantyFields({ value, onChange }: {
  value: WarrantyValues
  onChange: (v: WarrantyValues) => void
}) {
  const set = (patch: Partial<WarrantyValues>) => onChange({ ...value, ...patch })
  const hasMonths = value.warrantyMonths.trim() !== ''

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Purchased on</label>
        <input
          type="date" value={value.purchasedAt}
          onChange={e => set({ purchasedAt: e.target.value })}
          className="field"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Warranty period</label>
        <div className="flex items-center gap-2">
          <input
            type="number" min={1} inputMode="numeric"
            value={value.warrantyMonths}
            onChange={e => set({ warrantyMonths: e.target.value })}
            placeholder="24"
            className="field w-24 text-center"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">months from the purchase date</span>
        </div>
        {hasMonths && !value.purchasedAt && !value.warrantyUntil && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Add a purchase date to count the period from, or set an end date below.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Cover ends (optional)
        </label>
        <input
          type="date" value={value.warrantyUntil}
          onChange={e => set({ warrantyUntil: e.target.value })}
          className="field"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          {value.warrantyUntil
            ? 'This exact date is used, ignoring the period above.'
            : 'Only needed when cover doesn’t simply run from the purchase date — e.g. it starts at delivery, or an extension.'}
        </p>
      </div>
    </div>
  )
}
