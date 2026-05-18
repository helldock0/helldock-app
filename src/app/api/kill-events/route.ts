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
}

export async function GET(req: Request) {
  const { teamId } = await requireSelectedTeam()
  const url = new URL(req.url)
  const mapParam = url.searchParams.get('map') ?? ''
  if (!(MAPS as readonly string[]).includes(mapParam)) {
    return NextResponse.json({ error: 'invalid map' }, { status: 400 })
  }
  const map = mapParam as Map

  const supabase = createClient()

  // Pull all match ids for this team + map
  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('id, match_date')
    .eq('team_id', teamId)
    .eq('map_name', map)
    .is('deleted_at', null)
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })
  const matchIds = (matches ?? []).map((m) => m.id)
  const dateByMatch: Record<string, string | null> = {}
  for (const m of matches ?? []) dateByMatch[m.id] = m.match_date

  if (matchIds.length === 0) {
    return NextResponse.json({ events: [] satisfies KillEventRow[] })
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
      'match_id, round_num, killer_x, killer_y, victim_x, victim_y, killer_is_ours, is_first_blood, weapon_id, headshot, ts_in_round_ms'
    )
    .in('match_id', matchIds)
  if (keErr) return NextResponse.json({ error: keErr.message }, { status: 500 })

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
    }
  })

  return NextResponse.json({ events: rows })
}
