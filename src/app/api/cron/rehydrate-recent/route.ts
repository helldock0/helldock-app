// Weekly auto-rehydrate cron. Pulls every non-manual match from the last 30
// days and re-runs the rehydrate helper to backfill any newly-shipped V4 fields
// (kill_events / impact metrics / S17 fields, etc).
//
// Idempotent: transformMatchToRows is pure and rehydrateMatch UPDATE/UPSERTs.
// Rate-limited to one Henrik fetch per RATE_LIMIT_MS to stay under their cap.
//
// Auth: Vercel Cron sends GET with Authorization: Bearer $CRON_SECRET.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rehydrateMatch } from '@/lib/henrik/rehydrate'

const LOOKBACK_DAYS = 30
const RATE_LIMIT_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const cutoffIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, match_id_helldock, henrik_id')
    .gte('match_date', cutoffIso)
    .not('henrik_id', 'is', null)
    .is('deleted_at', null)
    .order('match_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({ attempted: 0, succeeded: 0, failures: [] })
  }

  type Failure = { match_id_helldock: string; status: number; error: string }
  const failures: Failure[] = []
  let succeeded = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const result = await rehydrateMatch(supabase, m.id)
    if (result.ok) {
      succeeded++
    } else {
      failures.push({
        match_id_helldock: m.match_id_helldock,
        status: result.status,
        error: result.error,
      })
    }
    // Throttle between matches except after the last one.
    if (i < matches.length - 1) await sleep(RATE_LIMIT_MS)
  }

  return NextResponse.json({
    attempted: matches.length,
    succeeded,
    failures,
    window_days: LOOKBACK_DAYS,
  })
}
