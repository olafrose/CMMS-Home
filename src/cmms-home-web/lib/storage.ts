import type { AppSettings, StorageLocation } from './types'

// Fallback glyph for a place with no icon assigned. Single source of truth.
export const DEFAULT_LOCATION_ICON = '🧊'

// Emoji palette offered when assigning an icon to a place. Single source of
// truth — used by the storage tree and the per-place "new sub-location" form.
export const LOCATION_ICON_CHOICES = ['🏠', '🏢', '🚪', '🗄️', '🪑', '📦', '🧰', '🗃️', '🧺', '🪜', '🚗', '🧊', '🔧', '🧯', '📁']

export interface PathFormatOptions {
  /** Keep only the last N segments. 0/undefined = full path, no truncation. */
  maxSegments?: number
  /** Stands in for the dropped ancestors. Default '…'. */
  ellipsis?: string
}

// Full breadcrumb path for a place id, e.g. "Garage › Cabinet › Bin 3".
// With `opts.maxSegments` set, keeps only the innermost N: "… Cabinet › Bin 3".
//
// NOTE the 16-iteration guard below silently truncates rather than erroring, which is
// why AppSettings.AbsoluteStorageMaxDepth (C#) is pinned to the same number — the API
// must never let a tree grow deeper than this walk can cover. Change both together.
export function locationPath(
  id: string | undefined,
  all: StorageLocation[],
  sep = ' › ',
  opts?: PathFormatOptions,
): string {
  if (!id) return ''
  const byId = new Map(all.map(l => [l.id, l]))
  const parts: string[] = []
  let cur = byId.get(id)
  let guard = 0
  while (cur && guard++ < 16) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  if (opts?.maxSegments && opts.maxSegments > 0 && parts.length > opts.maxSegments) {
    // Ellipsis then a plain space — NOT joined with `sep`, which would give the
    // misleading "… › Cabinet › Bin 3" (an ellipsis is not a path segment).
    return `${opts.ellipsis ?? '…'} ${parts.slice(-opts.maxSegments).join(sep)}`
  }
  return parts.join(sep)
}

// Breadcrumb for a *reference* to a place (lists, dashboard, equipment labels),
// shortened per the user's saved policy. A place's own label/heading should use
// locationPath() directly so it always shows its full lineage.
//
// Settings may be undefined while still loading — render the full path rather than
// flashing a shortened one that then changes.
export function formatLocationPath(
  id: string | undefined,
  all: StorageLocation[],
  settings: AppSettings | undefined,
  sep = ' › ',
): string {
  const maxSegments = settings?.pathShorteningMode === 'LastNSegments'
    ? settings.pathShorteningSegments
    : undefined
  return locationPath(id, all, sep, { maxSegments })
}

// Direct children of a place (or roots when parentId is undefined), name-sorted.
export function childrenOf(parentId: string | undefined, all: StorageLocation[]): StorageLocation[] {
  return all
    .filter(l => (l.parentId ?? undefined) === (parentId ?? undefined))
    .sort((a, b) => a.name.localeCompare(b.name))
}
