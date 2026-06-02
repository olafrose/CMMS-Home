import { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const url = `${API_URL}/${path.join('/')}${request.nextUrl.search}`

  const init: RequestInit = { method: request.method }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text()
    init.headers = { 'Content-Type': 'application/json' }
  }

  const upstream = await fetch(url, init)
  const body = upstream.status === 204 ? null : await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
