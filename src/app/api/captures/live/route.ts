import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateToken } from '@/lib/captures/token'

export const dynamic = 'force-dynamic'

interface KillData {
  attacker_id: string
  victim_id: string
  weapon: string
  headshot: boolean
  ts_ms: number
}

interface LiveRoundPayload {
  round: number
  our_side: 'attack' | 'defense'
  our_won: boolean
  our_score: number
  opp_score: number
  kills: KillData[]
  plant: { site: string; ts_ms: number } | null
  defuse: { ts_ms: number } | null
  ts_ms: number
}

/**
 * Batch live round-event ingest from the Overwolf app. Fires immediately on
 * match_end, before the 3-minute Henrik indexing delay. Returns before the
 * parity /api/captures/ingest call completes.
 *
 * Body: { henrikId: string, rounds: LiveRoundPayload[] }
 * Header: Authorization: Bearer helldock_*
 *
 * Idempotent: upserts on (henrik_id, round). Safe to call multiple times.
 */
export async function POST(req: Request) {
  const supabase = createAdminClient()

  const auth = await authenticateToken(supabase, req.headers.get('authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'invalid or revoked token' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as {
    henrikId?: unknown
    rounds?: unknown
  } | null

  const henrikId = typeof body?.henrikId === 'string' ? body.henrikId.trim() : ''
  if (!henrikId) {
    return NextResponse.json({ error: 'henrikId required' }, { status: 400 })
  }

  const rounds = Array.isArray(body?.rounds) ? (body.rounds as LiveRoundPayload[]) : []
  if (rounds.length === 0) {
    return NextResponse.json({ status: 'ingested', rows: 0 })
  }

  const rows = rounds.map((r) => ({
    henrik_id: henrikId,
    team_id: auth.teamId,
    round: r.round,
    our_side: r.our_side,
    our_won: r.our_won,
    our_score: r.our_score,
    opp_score: r.opp_score,
    kills: r.kills ?? [],
    plant: r.plant ?? null,
    defuse: r.defuse ?? null,
    ts_ms: r.ts_ms,
    source: 'overwolf_gep',
  }))

  const { error } = await supabase
    .from('live_round_events')
    .upsert(rows, { onConflict: 'henrik_id,round' })

  if (error) {
    console.error('[live] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 502 })
  }

  return NextResponse.json({ status: 'ingested', rows: rows.length })
}
