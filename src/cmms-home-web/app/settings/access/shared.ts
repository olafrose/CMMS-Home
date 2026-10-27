import { ApiError } from '@/lib/api'

/** The card surface every settings page is built from. Kept in step with app/settings/page.tsx. */
export const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

/**
 * The messages the server keyed to one field, e.g. `roleIds` or `grants.<roleId>`.
 *
 * The access endpoints answer with ValidationProblem for every refusal that has a reason a
 * user can act on ("this is the last active administrator", "Anonymous cannot be given
 * administrative permissions"). Those messages are better than anything we could write here,
 * so they are shown verbatim against the control that caused them.
 */
export function fieldErrors(e: unknown, key: string): string[] {
  return e instanceof ApiError ? e.errors?.[key] ?? [] : []
}

/**
 * A message worth showing the user for a failed call.
 *
 * Prefers the server's own validation text, because ApiError.message for a
 * ValidationProblem is only the generic "One or more validation errors occurred."
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback
  const validation = Object.values(e.errors ?? {}).flat()
  if (validation.length > 0) return validation.join(' ')
  if (e.isDenied) return 'You are not allowed to do that.'
  return e.detail || fallback
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
