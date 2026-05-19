import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireSelectedTeam } from '@/lib/team-session'
import { MAPS, type Map } from '@/lib/valorant'

export type KillEventRow = {
  killer_x: number | null
  killer_y: number | null
  victim_x: number | null
  victim_y: number | null
  killer_is_ours: boolean | null
  is_first_blood: boolean | null
  round_num: number
  side: string | null
  match_id: string
  match_date: string | null
  weapon_id: string | null
  headshot: boolean | null
  ts_in_round_ms: number | null
  plant_time_in_round: number | null
  round_outcome: string | null
  // Part 2 — filter affordances
  killer_puuid: string | null
  victim_puuid: string | null
  opponent_name: string | null
}

export type RosterEntry = { puuid: string; display_name: string }

export type KillEventsResponse = {
  events: KillEventRow[]
  roster: RosterEntry[]
}

export async function GET(req: Request) {
  const { teamId } = await requireSelectedTeam()
  const url = new URL(req.url)
  const mapParam = url.searchParams.get('map') ?? ''
  const matchIdParam = url.searchParams.get('match_id') // Part 4 — single-match shortcut

  // Validate inputs: either ?map=... OR ?match_id=...
  if (!matchIdParam) {
    if (!(MAPS as readonly string[]).includes(mapParam)) {
      return NextResponse.json({ error: 'invalid map' }, { status: 400 })
    }
  }
  const map = matchIdParam ? null : (mapParam as Map)

  const supabase = createClient()

  // Pull match ids — either all for this team+map, or just the one requested
  let matchesQuery = supabase
    .from('matches')
    .select('id, match_date, opponent_name')
    .eq('team_id', teamId)
    .is('deleted_at', null)
  if (matchIdParam) {
    matchesQuery = matchesQuery.eq('id', matchIdParam)
  } else if (map) {
    matchesQuery = matchesQuery.eq('map_name', map)
  }
  const { data: matches, error: matchErr } = await matchesQuery
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })
  const matchIds = (matches ?? []).map((m) => m.id)
  const dateByMatch: Record<string, string | null> = {}
  const oppByMatch: Record<string, string | null> = {}
  for (const m of matches ?? []) {
    dateByMatch[m.id] = m.match_date
    oppByMatch[m.id] = m.opponent_name
  }

  if (matchIds.length === 0) {
    return NextResponse.json({ events: [], roster: [] } satisfies KillEventsResponse)
  }

  // Round-side + plant-time + outcome lookup. Side drives the heatmap side
  // toggle; plant_time_in_round drives the post-plant / retake heatmap modes;
  // outcome colors tactical dots green (won the round) vs crimson (lost it).
  const { data: rounds, error: rndErr } = await supabase
    .from('rounds')
    .select('match_id, round_num, side, plant_time_in_round, outcome')
    .in('match_id', matchIds)
  if (rndErr) return NextResponse.json({ error: rndErr.message }, { status: 500 })
  const sideByKey: Record<string, string | null> = {}
  const plantByKey: Record<string, number | null> = {}
  const outcomeByKey: Record<string, string | null> = {}
  for (const r of rounds ?? []) {
    const key = `${r.match_id}|${r.round_num}`
    sideByKey[key] = r.side
    plantByKey[key] = r.plant_time_in_round
    outcomeByKey[key] = r.outcome
  }

  const { data: events, error: keErr } = await supabase
    .from('kill_events')
    .select(
      'match_id, round_num, killer_x, killer_y, victim_x, victim_y, killer_is_ours, is_first_blood, weapon_id, headshot, ts_in_round_ms, killer_puuid, victim_puuid'
    )
    .in('match_id', matchIds)
  if (keErr) return NextResponse.json({ error: keErr.message }, { status: 500 })

  // Roster for the player filter — every linked Riot account on this team
  // (excludes trial players from team aggregates, matching the rest of the app).
  const { data: accountRows } = await supabase
    .from('player_accounts')
    .select('puuid, players!inner(display_name, team_id, roster_status, is_active)')
    .eq('players.team_id', teamId)
    .not('puuid', 'is', null)

  const rosterMap = new Map<string, string>()
  // Supabase's nested-select infers `players` as an array (1:N from its FK perspective)
  // even though our FK is 1:1. Unwrap defensively.
  for (const a of (accountRows ?? []) as unknown as Array<{
    puuid: string | null
    players:
      | { display_name: string; roster_status: string | null; is_active: boolean | null }[]
      | { display_name: string; roster_status: string | null; is_active: boolean | null }
      | null
  }>) {
    if (!a.puuid) continue
    const p = Array.isArray(a.players) ? a.players[0] : a.players
    if (!p) continue
    if (p.roster_status === 'trial') continue
    if (p.is_active === false) continue
    // First puuid per name wins — later ones (alt accounts) get same label so it's fine to dedupe by puuid.
    rosterMap.set(a.puuid, p.display_name)
  }
  const roster: RosterEntry[] = Array.from(rosterMap, ([puuid, display_name]) => ({
    puuid,
    display_name,
  })).sort((a, b) => a.display_name.localeCompare(b.display_name))

  const rows: KillEventRow[] = (events ?? []).map((e) => {
    const key = `${e.match_id}|${e.round_num}`
    return {
      killer_x: e.killer_x,
      killer_y: e.killer_y,
      victim_x: e.victim_x,
      victim_y: e.victim_y,
      killer_is_ours: e.killer_is_ours,
      is_first_blood: e.is_first_blood,
      round_num: e.round_num,
      side: sideByKey[key] ?? null,
      match_id: e.match_id,
      match_date: dateByMatch[e.match_id] ?? null,
      weapon_id: e.weapon_id,
      headshot: e.headshot,
      ts_in_round_ms: e.ts_in_round_ms,
      plant_time_in_round: plantByKey[key] ?? null,
      round_outcome: outcomeByKey[key] ?? null,
      killer_puuid: e.killer_puuid,
      victim_puuid: e.victim_puuid,
      opponent_name: oppByMatch[e.match_id] ?? null,
    }
  })

  return NextResponse.json({ events: rows, roster } satisfies KillEventsResponse)
}
