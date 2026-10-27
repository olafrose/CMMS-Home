import type { MaintenanceTarget } from './types'

export const EVENT_TYPES = [
  { value: 'maintenance', label: '🔩 Maintenance', active: 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  { value: 'cleaning',    label: '🧹 Cleaning',    active: 'border-teal-400 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
  { value: 'repair',      label: '🛠 Repair',      active: 'border-red-400 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  { value: 'replacement', label: '🔄 Replacement', active: 'border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
]

export const EVENT_TYPE_COLOR: Record<string, string> = {
  maintenance: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  repair: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  cleaning: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  replacement: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
}

// An event or rule targets one piece of equipment or one place. These keep the two
// spellings of that — the API's pair of nullable ids and the UI's { kind, id } — in one spot.

/** The target an event or rule names. */
export function targetOf(x: { equipmentId: string | null; storageLocationId: string | null }): MaintenanceTarget {
  return x.storageLocationId
    ? { kind: 'place', id: x.storageLocationId }
    : { kind: 'equipment', id: x.equipmentId! }
}

/** The body fields naming a target, for create DTOs and the label-session exchange. */
export function targetFields(t: MaintenanceTarget): { equipmentId?: string; storageLocationId?: string } {
  return t.kind === 'place' ? { storageLocationId: t.id } : { equipmentId: t.id }
}

/** `?equipment_id=…` / `?storage_location_id=…`, or '' for no target (unfiltered). */
export function targetQuery(t?: MaintenanceTarget): string {
  if (!t) return ''
  return t.kind === 'place' ? `?storage_location_id=${t.id}` : `?equipment_id=${t.id}`
}

export const targetHref = (t: MaintenanceTarget) =>
  t.kind === 'place' ? `/storage/${t.id}` : `/equipment/${t.id}`

export const targetLogHref = (t: MaintenanceTarget) => `${targetHref(t)}/log`

/** The event detail page, carrying the target so its back link returns there. */
export const eventHref = (eventId: string, t: MaintenanceTarget) => `/events/${eventId}${targetQuery(t)}`
