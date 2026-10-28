import { ApiError } from './api'

/**
 * Page-loading helpers.
 *
 * A page's own list and the lookups that merely decorate it (the storage tree for
 * breadcrumbs, AppSettings for how to shorten them) need different permissions. Loading
 * them with one bare Promise.all meant a refused lookup blanked the whole page — an
 * Anonymous role without "Read settings" saw every list empty, with no hint why.
 */

/** A lookup the page can live without: refused or failed, it yields `fallback`. */
export function optional<T>(request: Promise<T>, fallback: T): Promise<T> {
  return request.catch(() => fallback)
}

/** What to tell the user when the page's *own* data couldn't be loaded. */
export function loadErrorMessage(e: unknown, what: string): string {
  if (e instanceof ApiError && e.isUnauthenticated) return `Sign in to see ${what}.`
  if (e instanceof ApiError && e.isDenied) return `You don't have access to ${what}. Ask an administrator.`
  return `Could not load ${what}. Check the connection and try again.`
}
