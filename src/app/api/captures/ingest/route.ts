import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateToken } from '@/lib/captures/token'
import { ingestMatch } from '@/lib/henrik/ingest'
import { baseUrlFromRequest } from '@/lib/discord'

export const dynamic = 'force-dynamic'

/**
 * Bearer-token endpoint used by the helldock-capture tray agent. The agent
 * grabs a matchId from Riot's local client API while a custom is live, waits
 * a few minutes for Henrik to index, then POSTs here.
 *
 * Body: { henrikId: string }
 * Header: Authorization: Bearer helldock_xxxxx
 *
 * The token IS the auth — no session cookie. Hence: service-role Supabase
 * client, never the anon key.
 */
export async function POST(req: Request) {
  const supabase = createAdminClient()

  const auth = await authenticateToken(supabase, req.headers.get('authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'invalid or revoked token' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { henrikId?: unknown } | null
  const henrikId = typeof body?.henrikId === 'string' ? body.henrikId.trim() : ''
  if (!henrikId) {
    return NextResponse.json({ error: 'henrikId required' }, { status: 400 })
  }

  const result = await ingestMatch({
    henrikId,
    teamSlug: auth.teamSlug,
    source: 'capture_agent',
    supabase,
    baseUrl: baseUrlFromRequest(req),
  })

  if (result.status === 'error') {
    const status = result.upstreamStatus === 404 ? 404 : 502
    return NextResponse.json({ status: 'error', error: result.error }, { status })
  }

  return NextResponse.json({
    status: result.status,
    helldockId: result.helldockId,
    matchUUID: result.matchUUID,
    team: auth.teamName,
    capturedBy: auth.playerName,
  })
}
