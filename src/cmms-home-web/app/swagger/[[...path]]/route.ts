import { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'

// Where the API's own routes live as seen from the browser: the /api proxy strips
// this prefix and forwards the rest, so /api/equipment reaches GET /equipment.
const API_PREFIX = '/api'

// Deployment toggle (SWAGGER_PROXY): off takes the API docs off the published web
// port. Deliberately permissive about spelling — silently still serving the docs
// because someone wrote `0` instead of `false` is the wrong way to be wrong.
// Read once at module load, so changing it needs a container restart (as API_URL does).
const OFF = new Set(['false', '0', 'off', 'no'])
const ENABLED = !OFF.has((process.env.SWAGGER_PROXY ?? '').trim().toLowerCase())

const PASS_THROUGH = ['content-type', 'cache-control', 'etag', 'last-modified', 'x-swagger-ui-version']
const CONDITIONAL = ['if-none-match', 'if-modified-since']

/**
 * Proxies Swagger UI and the OpenAPI document from the api container, so the docs
 * are reachable on the single published web port. Only that port is published in
 * deploy/docker-compose.nas.yml — without this, /swagger has no route from outside.
 * Set SWAGGER_PROXY=false to close it off again.
 */
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  // Answer as if the route didn't exist, rather than redirecting into a 404.
  if (!ENABLED) return new Response(null, { status: 404 })

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
  for (const h of CONDITIONAL) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v) // let the browser re-validate the ~1MB UI bundle
  }

  const upstream = await fetch(
    `${API_URL}/swagger/${path.join('/')}${request.nextUrl.search}`,
    { method: request.method, headers, redirect: 'manual' },
  )

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
