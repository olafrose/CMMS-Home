import { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'

// Preserve these from the upstream response so binary content (e.g. PDFs via
// /documents/{id}/content) renders instead of being re-encoded as JSON.
const PASS_THROUGH = ['content-type', 'content-disposition', 'content-length', 'accept-ranges', 'content-range', 'cache-control']

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const url = `${API_URL}/${path.join('/')}${request.nextUrl.search}`

  const init: RequestInit = { method: request.method }
  const headers = new Headers()
  const range = request.headers.get('range')
  if (range) headers.set('range', range) // let PDF viewers stream byte ranges
  // The session lives in an HttpOnly cookie the browser sets against *this* origin, so
  // without forwarding it every call reaches the API as an anonymous stranger.
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  // So the sessions list names the device the user is holding rather than undici.
  const userAgent = request.headers.get('user-agent')
  if (userAgent) headers.set('user-agent', userAgent)
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Stream the body through untouched and forward the original content-type,
    // so multipart uploads (with their boundary) survive as well as JSON.
    const contentType = request.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)
    init.body = request.body
    // Required by fetch when the body is a stream (Node/undici).
    ;(init as RequestInit & { duplex?: 'half' }).duplex = 'half'
  }
  init.headers = headers

  const upstream = await fetch(url, init)

  const respHeaders = new Headers()
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h)
    if (v) respHeaders.set(h, v)
  }

  // Set-Cookie is the one header that legitimately repeats, and `get` would fold the
  // copies into one comma-joined string — which mangles them, since `Expires` dates
  // contain a comma too. getSetCookie() keeps them separate; append preserves that.
  for (const value of upstream.headers.getSetCookie()) {
    respHeaders.append('set-cookie', value)
  }

  // Stream the body through untouched (binary-safe); 204 has no body.
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
