import { createClient } from '@/lib/supabase/server'
import { TEAM_CONFIGS } from '@/lib/teams'
import { fetchMatchesV4 } from '@/lib/henrik/client'
import { transformMatchToRows } from '@/lib/henrik/transformers'
import { NextResponse } from 'next/server'

const MIN_ROUNDS = 12
const FETCH_SIZE = 10
const API_KEY = process.env.HENRIK_API_KEY ?? ''

export type MatchPreview = {
  henrik_id: string
  date: string
  map: string
  our_score: number
  opp_score: number
  result: string
  rounds_played: number
  is_premier: boolean
  is_already_in_db: boolean
  is_internal_scrim: boolean  // true when 3+ opp players are on our other academy team's roster
  opp_team_name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_match: any
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamSlug } = await req.json()
  const teamConfig = TEAM_CONFIGS[teamSlug]
  if (!teamConfig) return NextResponse.json({ error: 'Unknown team' }, { status: 400 })

  const { name, tag, region } = teamConfig.mainAccount
  const mainRiotId = `${name}#${tag}`

  // Other academy team's roster (for internal-scrim detection)
  const otherTeamRosterKeys = new Set(
    Object.keys(TEAM_CONFIGS)
      .filter((s) => s !== teamSlug)
      .flatMap((s) => Object.keys(TEAM_CONFIGS[s].roster))
  )

  // Get team DB record first (lookup once)
  const { data: teamRow } = await supabase
    .from('teams')
    .select('id')
    .eq('slug', teamSlug)
    .single()
  const teamId = teamRow?.id
  if (!teamId) return NextResponse.json({ error: 'Team not found in DB' }, { status: 404 })

  // Last match date + henrik_ids already in DB FOR THIS TEAM (scoped per team so
  // the same Henrik match can be imported once per team — e.g. internal scrims).
  const [{ data: lastMatch }, { data: existingMatches }] = await Promise.all([
    supabase
      .from('matches')
      .select('match_date')
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .order('match_date', { ascending: false })
      .limit(1),
    supabase
      .from('matches')
      .select('henrik_id')
      .eq('team_id', teamId)
      .not('henrik_id', 'is', null)
      .is('deleted_at', null),
  ])

  const lastMatchDate: string | null = lastMatch?.[0]?.match_date ?? null
  const existingHenrikIds = new Set((existingMatches ?? []).map((m: { henrik_id: string }) => m.henrik_id))

  // V4 has a dedicated mode=premier — fetch customs + premier directly
  // (avoids burning rate-limit on competitive matches we'd filter out).
  const [customsResp, premierResp] = await Promise.all([
    fetchMatchesV4(name, tag, region, 'custom', FETCH_SIZE, API_KEY),
    fetchMatchesV4(name, tag, region, 'premier', FETCH_SIZE, API_KEY),
  ])

  const rawMatches: Array<{ match: unknown; isPremier: boolean }> = []

  for (const m of customsResp.data ?? []) {
    rawMatches.push({ match: m, isPremier: false })
  }
  for (const m of premierResp.data ?? []) {
    rawMatches.push({ match: m, isPremier: true })
  }

  // Filter + build previews
  const previews: MatchPreview[] = []

  for (const { match, isPremier } of rawMatches) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = match as any
    const meta = m?.metadata ?? {}
    // V4 list endpoint omits metadata.rounds_played — derive from teams[].rounds (won+lost).
    const firstTeam = Array.isArray(m?.teams) ? m.teams[0] : null
    const roundsPlayed: number =
      meta.rounds_played ??
      (firstTeam ? (firstTeam.rounds?.won ?? 0) + (firstTeam.rounds?.lost ?? 0) : 0)
    if (roundsPlayed < MIN_ROUNDS) continue
    if (meta.is_completed === false) continue

    // V4: metadata.match_id + started_at (ISO). V3 fallback: matchid + game_start.
    const henrikId: string = meta.match_id ?? meta.matchid ?? ''
    const matchDate =
      typeof meta.started_at === 'string'
        ? meta.started_at.split('T')[0]
        : typeof meta.game_start === 'number' && meta.game_start > 0
          ? new Date(meta.game_start * 1000).toISOString().split('T')[0]
          : ''

    // Skip matches older than last imported
    if (lastMatchDate && matchDate && matchDate < lastMatchDate) continue

    const isAlreadyInDb = existingHenrikIds.has(henrikId)

    // Quick transform to get scores + opp name (reuse transformer)
    const xfResult = transformMatchToRows(m, mainRiotId, teamConfig.roster, isPremier)
    if ('error' in xfResult) continue

    // Internal scrim = 3+ opp players are on our other academy team's roster
    const internalOverlap = xfResult.oppPlayers.filter((p) =>
      otherTeamRosterKeys.has(p.riot_id_full)
    ).length
    const isInternalScrim = internalOverlap >= 3

    previews.push({
      henrik_id: henrikId,
      date: matchDate,
      // V4: meta.map is { name, id }. V3: meta.map was a string. Prefer transformer's normalized value.
      map: xfResult.matchData.map_name || (typeof meta.map === 'string' ? meta.map : meta.map?.name ?? ''),
      our_score: xfResult.matchData.our_score,
      opp_score: xfResult.matchData.opp_score,
      result: xfResult.matchData.result,
      rounds_played: roundsPlayed,
      is_premier: isPremier,
      is_already_in_db: isAlreadyInDb,
      is_internal_scrim: isInternalScrim,
      opp_team_name: xfResult.matchData.opponent_name,
      raw_match: m,
    })
  }

  // Sort newest first for display
  previews.sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json({ previews, teamId })
}
