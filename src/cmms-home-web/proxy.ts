import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Optimistic sign-in redirect.
 *
 * Per Next's own auth guidance this is a *cheap* check and never the defence: it only asks
 * whether a session cookie is present, not whether it is valid or what it may do. The API
 * enforces every permission independently, so the worst a wrong answer here costs is a
 * needless bounce to /login (or a page that renders and then shows its own denial).
 * Deliberately no API call — Proxy runs on every request including prefetches.
 */
const SESSION_COOKIE = 'cmms_session'

/**
 * The anonymous credential. Someone who scanned a printed label holds this and no session,
 * and must not be bounced to /login: the log form sends them to /events/{id} on save, so
 * treating only `cmms_session` as a credential would end a *successful* one-tap log on a
 * sign-in page. What that cookie actually permits is the API's decision, not ours.
 */
const LABEL_COOKIE = 'cmms_label'

/** Pages anyone must be able to reach, sign-in included. */
const PUBLIC_PATHS = new Set([
  '/login',
  '/setup',
  // The QR scanner itself: you scan *before* you have any reason to be signed in.
  '/scan',
])

/**
 * Prefixes that are not user-facing pages at all (the API proxy, Next internals, the
 * service worker and PWA assets). Redirecting any of these breaks the app rather than
 * protecting it — a redirected /api call would hand JSON callers an HTML login page.
 */
const PUBLIC_PREFIXES = [
  '/api/',
  '/swagger',
  '/_next/',
  '/icons/',
  '/manifest',
  '/sw.js',
  '/workbox-',
  '/swe-worker-',
  '/fallback-',
  '/favicon.ico',
]

/**
 * The anonymous QR fast path: a printed label opens the item or its log form directly, and
 * whoever is holding the label proves that with the `?t=` token the page exchanges. Bouncing
 * these to /login would destroy the entire feature, so they are matched explicitly —
 * `/equipment/{id}`, `/equipment/{id}/log`, and the legacy `/assets/...` forms still living
 * on labels printed before the merge. `new` is excluded: it is a create form, not a scan.
 * A place's label only reaches `/storage/{id}/log`: its contents page needs storage.read,
 * which a label never grants, so letting that through would only show an error.
 */
const QR_PATH = /^\/(?:(?:equipment|assets)\/(?!new$)[^/]+(?:\/log)?|storage\/[^/]+\/log)$/

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    QR_PATH.test(pathname)
  ) {
    return NextResponse.next()
  }

  if (!request.cookies.has(SESSION_COOKIE) && !request.cookies.has(LABEL_COOKIE)) {
    const login = new URL('/login', request.nextUrl)
    // So sign-in can return them to what they were actually after.
    login.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  // Static assets and files with an extension never need an auth decision, and matching
  // them would only slow every request down. Everything else reaches the function above,
  // which owns the exemption list — keep the two in step.
  matcher: ['/((?!api/|_next/|.*\\.[^/]+$).*)'],
}
