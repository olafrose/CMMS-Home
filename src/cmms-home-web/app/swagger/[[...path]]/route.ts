import { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'

// Where the API's own routes live as seen from the browser: the /api proxy strips
// this prefix and forwards the rest, so /api/equipment reaches GET /equipment.
const API_PREFIX = '/api'

const PASS_THROUGH = ['content-type', 'cache-control', 'etag', 'last-modified', 'x-swagger-ui-version']
// The credentials: the API gates /swagger on api.docs, so without these every visit would
// reach it as Anonymous and be refused.
const FORWARDED = ['if-none-match', 'if-modified-since', 'cookie', 'authorization']

/**
 * Proxies Swagger UI and the OpenAPI document from the api container, so the docs
 * are reachable on the single published web port. Only that port is published in
 * deploy/docker-compose.nas.yml — without this, /swagger has no route from outside.
 * Who may open it is the API's decision (the api.docs permission), not this proxy's.
 */
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params

  // Swagger UI's index.html references its assets and the spec *relatively*
  // ('./swagger-ui.css', 'v1/swagger.json'), so the browser has to sit at
  // /swagger/index.html for those to resolve back into this proxy. Redirect
  // ourselves rather than forwarding the upstream 301, whose Location is relative.
  if (!path?.length) {
    return new Response(null, { status: 307, headers: { location: '/swagger/index.html' } })
  }

  const headers = new Headers()
  // Tell the API which prefix it is being viewed under, so the OpenAPI document
  // it serves points "Try it out" at the /api proxy instead of this host's root.
  headers.set('x-forwarded-prefix', API_PREFIX)
  for (const h of FORWARDED) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v) // conditionals let the browser re-validate the ~1MB UI bundle
  }

  const upstream = await fetch(
    `${API_URL}/swagger/${path.join('/')}${request.nextUrl.search}`,
    { method: request.method, headers, redirect: 'manual' },
  )

  // Someone opening the docs page while signed out: send them to sign in and back, rather
  // than showing a bare problem+json. Only for the page itself — the spec and assets are
  // fetched by scripts and by Swagger UI, which want the status code, not a redirect.
  if (upstream.status === 401 && path.join('/') === 'index.html' && !request.headers.get('authorization')) {
    const login = new URL('/login', request.nextUrl)
    login.searchParams.set('next', '/swagger/index.html')
    return new Response(null, { status: 307, headers: { location: login.pathname + login.search } })
  }

  const respHeaders = new Headers()
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h)
    if (v) respHeaders.set(h, v)
  }

  const bodyless = upstream.status === 204 || upstream.status === 304
  return new Response(bodyless ? null : upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  })
}

export const GET = proxy
export const HEAD = proxy
