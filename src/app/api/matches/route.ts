import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notifyDiscordForMatch, baseUrlFromRequest } from '@/lib/discord'

type OurPlayerInput = { player_id: string | null; agent: string | null }

type NewMatchPayload = {
  team_slug: string
  match_date: string
  match_type: string | null
  opponent_name: string | null
  map_name: string | null
  pick: string | null
  start_side: string | null
  our_score: number
  opp_score: number
  our_players: OurPlayerInput[]      // length 5
  opp_agents: (string | null)[]      // length 5
  vibe_tag: string | null
  notes: string | null
}

function nextMatchIdHelldock(current: string | null): string {
  const num = current ? parseInt(current.replace('M', ''), 10) : 0
  return `M${String(num + 1).padStart(3, '0')}`
}

const PLACEHOLDER_ROUNDS = 24

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as NewMatchPayload

  // Resolve team
  const { data: teamRow } = await supabase
    .from('teams')
    .select('id')
    .eq('slug', body.team_slug)
    .single()
  if (!teamRow) return NextResponse.json({ error: 'Team not found' }, { status: 400 })

  // Generate next match ID
  const { data: maxRow } = await supabase
    .from('matches')
    .select('match_id_helldock')
    .order('match_id_helldock', { ascending: false })
    .limit(1)
  const newMatchId = nextMatchIdHelldock(maxRow?.[0]?.match_id_helldock ?? null)

  // Session # for this team on this date
  const { count: sameDayCount } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamRow.id)
    .eq('match_date', body.match_date)
  const sessionNum = (sameDayCount ?? 0) + 1

  // Derive result + rounds_played
  const result =
    body.our_score > body.opp_score ? 'W' : body.opp_score > body.our_score ? 'L' : null
  const roundsPlayed = body.our_score + body.opp_score

  const ourAgents = body.our_players.map((p) => p.agent).filter((a): a is string => !!a)
  const oppAgentsClean = body.opp_agents.filter((a): a is string => !!a && a.length > 0)

  // Insert match
  const { data: insertedMatch, error: matchError } = await supabase
    .from('matches')
    .insert({
      match_id_helldock: newMatchId,
      team_id: teamRow.id,
      henrik_id: null,
      is_manual_entry: true,
      match_date: body.match_date,
      match_type: body.match_type,
      session_num: sessionNum,
      opponent_name: body.opponent_name,
      map_name: body.map_name,
      pick: body.pick,
      start_side: body.start_side,
      our_score: body.our_score,
      opp_score: body.opp_score,
      result,
      our_agents: ourAgents,
      opp_agents: oppAgentsClean,
      rounds_played: roundsPlayed,
      vibe_tag: body.vibe_tag,
      notes: body.notes,
    })
    .select('id, match_id_helldock')
    .single()

  if (matchError || !insertedMatch) {
    return NextResponse.json(
      { error: matchError?.message ?? 'Match insert failed' },
      { status: 500 }
    )
  }

  const matchUUID = insertedMatch.id

  // Insert 24 placeholder rounds
  const roundRows = Array.from({ length: PLACEHOLDER_ROUNDS }, (_, i) => ({
    match_id: matchUUID,
    round_num: i + 1,
  }))
  const { error: roundsError } = await supabase.from('rounds').insert(roundRows)
  if (roundsError) {
    return NextResponse.json({ error: `Rounds insert failed: ${roundsError.message}` }, { status: 500 })
  }

  // Insert 5 match_players (player_id + agent, stats null)
  const matchPlayerRows = body.our_players.map((p) => ({
    match_id: matchUUID,
    player_id: p.player_id,
    agent: p.agent,
  }))
  const { error: mpError } = await supabase.from('match_players').insert(matchPlayerRows)
  if (mpError) {
    return NextResponse.json({ error: `match_players insert failed: ${mpError.message}` }, { status: 500 })
  }

  // Insert 5 opp_players (placeholder names, agent if provided)
  const oppPlayerRows = body.opp_agents.map((agent, i) => ({
    match_id: matchUUID,
    opp_player_name: `Player${i + 1}`,
    agent: agent || null,
  }))
  const { error: oppError } = await supabase.from('opp_players').insert(oppPlayerRows)
  if (oppError) {
    return NextResponse.json({ error: `opp_players insert failed: ${oppError.message}` }, { status: 500 })
  }

  // Fire-and-forget Discord notification — never throws, never blocks the response.
  await notifyDiscordForMatch(supabase, teamRow.id, matchUUID, baseUrlFromRequest(req))

  return NextResponse.json({
    id: matchUUID,
    match_id_helldock: insertedMatch.match_id_helldock,
  })
}
