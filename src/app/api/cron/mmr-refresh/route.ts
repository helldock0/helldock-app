// Daily MMR refresh cron. Pulls every distinct (riot_id, region) pair appearing
// in the last 30 days of opponents, fetches fresh MMR via Henrik V3, and upserts
// into player_mmr_cache. Mirrors the per-team /api/mmr/refresh logic but scoped
// to all teams + scheduled.
//
// Auth: Vercel Cron sends GET with a Bearer of $CRON_SECRET. Reject otherwise.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchMmr } from '@/lib/henrik/client'

const API_KEY = process.env.HENRIK_API_KEY ?? process.env.HENRIKDEV_API_KEY ?? ''
const CONCURRENCY = 5
const LOOKBACK_DAYS = 30

type RefreshError = { riot_id: string; error: string }

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
  if (!API_KEY) {
    return NextResponse.json({ error: 'HENRIK_API_KEY not set' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const cutoffIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // Pull matches in window with their team region, plus opp_players riot_id_full.
  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('id, team_id, team:teams(region)')
    .gte('match_date', cutoffIso)
    .is('deleted_at', null)
  if (matchErr) {
    return NextResponse.json({ error: matchErr.message }, { status: 500 })
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({ refreshed: 0, attempted: 0, errors: [], note: 'no matches in window' })
  }

  const matchIds = matches.map((m) => m.id)
  const regionByMatchId: Record<string, string> = {}
  // Supabase returns the joined `team:teams(region)` as an array (could be
  // multiple, even though our FK is 1:1). Unwrap defensively.
  for (const m of matches as unknown as Array<{
    id: string
    team: { region: string | null }[] | { region: string | null } | null
  }>) {
    const team = Array.isArray(m.team) ? m.team[0] : m.team
    regionByMatchId[m.id] = team?.region ?? 'ap'
  }

  const { data: opps, error: oppErr } = await supabase
    .from('opp_players')
    .select('match_id, riot_id_full')
    .in('match_id', matchIds)
  if (oppErr) {
    return NextResponse.json({ error: oppErr.message }, { status: 500 })
  }

  // Dedupe to (riot_id, region) pairs. Prefer the most-recent region if a riot_id
  // somehow appears under two regions (shouldn't, but safe).
  const seen = new Map<string, { riotId: string; region: string }>()
  for (const op of opps ?? []) {
    const rid = op.riot_id_full
    if (!rid || !rid.includes('#')) continue
    const region = regionByMatchId[op.match_id] ?? 'ap'
    seen.set(`${rid}::${region}`, { riotId: rid, region })
  }
  const targets = Array.from(seen.values())

  let refreshed = 0
  const errors: RefreshError[] = []

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async ({ riotId, region }) => {
        const [name, tag] = riotId.split('#')
        if (!name || !tag) {
          return { riotId, error: 'malformed riot_id' }
        }
        const data = await fetchMmr(name, tag, region, API_KEY)
        if (!data || data?.errors) {
          return { riotId, error: JSON.stringify(data?.errors ?? data) }
        }
        const puuid: string | null = data.account?.puuid ?? data.puuid ?? null
        if (!puuid) return { riotId, error: 'no puuid in response' }

        const current = data.current ?? {}
        const peak = data.peak ?? {}
        const row = {
          puuid,
          riot_id: riotId,
          region,
          current_tier_name: current.tier?.name ?? null,
          current_rr: typeof current.rr === 'number' ? current.rr : null,
          current_elo: typeof current.elo === 'number' ? current.elo : null,
          current_leaderboard_placement:
            typeof current.leaderboard_placement === 'number'
              ? current.leaderboard_placement
              : null,
          peak_tier_name: peak.tier?.name ?? null,
          peak_season_id: peak.season?.id ?? peak.season?.short ?? null,
          fetched_at: new Date().toISOString(),
        }

        const { error: upsertErr } = await supabase
          .from('player_mmr_cache')
          .upsert(row, { onConflict: 'puuid' })
        if (upsertErr) return { riotId, error: upsertErr.message }
        return { riotId, ok: true as const }
      })
    )
    for (const r of results) {
      if ('ok' in r && r.ok) refreshed++
      else if ('error' in r && r.error) errors.push({ riot_id: r.riotId, error: r.error })
    }
  }

  return NextResponse.json({
    attempted: targets.length,
    refreshed,
    errors,
    window_days: LOOKBACK_DAYS,
  })
}
