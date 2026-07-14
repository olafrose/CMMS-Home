import type { StorageLocation } from './types'

// Fallback glyph for a place with no icon assigned. Single source of truth.
export const DEFAULT_LOCATION_ICON = '🧊'

// Emoji palette offered when assigning an icon to a place. Single source of
// truth — used by the storage tree and the per-place "new sub-location" form.
export const LOCATION_ICON_CHOICES = ['🏠', '🏢', '🚪', '🗄️', '🪑', '📦', '🧰', '🗃️', '🧺', '🪜', '🚗', '🧊', '🔧', '🧯', '📁']

// Full breadcrumb path for a place id, e.g. "Garage › Cabinet › Bin 3".
export function locationPath(id: string | undefined, all: StorageLocation[], sep = ' › '): string {
  if (!id) return ''
  const byId = new Map(all.map(l => [l.id, l]))
  const parts: string[] = []
  let cur = byId.get(id)
  let guard = 0
  while (cur && guard++ < 16) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(sep)
}

// Direct children of a place (or roots when parentId is undefined), name-sorted.
export function childrenOf(parentId: string | undefined, all: StorageLocation[]): StorageLocation[] {
  return all
    .filter(l => (l.parentId ?? undefined) === (parentId ?? undefined))
    .sort((a, b) => a.name.localeCompare(b.name))
}
