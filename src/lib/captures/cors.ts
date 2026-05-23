import { NextResponse } from 'next/server'

// When STRICT_CORS=true, the capture routes only set CORS headers for the
// app's own origin. Non-browser callers (Electron tray, Overwolf, curl, Node
// scripts) don't enforce CORS, so they keep working either way.
const STRICT = process.env.STRICT_CORS === 'true'
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helldock-app.vercel.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': STRICT ? ALLOWED_ORIGIN : '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  Vary: 'Origin',
}

export function corsHeaders(): Record<string, string> {
  return CORS_HEADERS
}

export function optionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function withCors(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v))
  return response
}
