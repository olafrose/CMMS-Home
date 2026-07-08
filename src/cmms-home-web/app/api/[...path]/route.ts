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
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text()
    headers.set('content-type', 'application/json')
  }
  init.headers = headers

  const upstream = await fetch(url, init)

  const respHeaders = new Headers()
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h)
    if (v) respHeaders.set(h, v)
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
