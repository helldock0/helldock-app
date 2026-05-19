import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

export type SearchMatch = {
  id: string
  matchIdHelldock: string
  date: string | null
  opp: string | null
  map: string | null
  result: string | null
  ourScore: number | null
  oppScore: number | null
}

export type SearchPlayer = {
  id: string
  name: string
  games: number
}

export type SearchOpponent = {
  name: string
  games: number
}

export type SearchResponse = {
  q: string
  matches: SearchMatch[]
  players: SearchPlayer[]
  opponents: SearchOpponent[]
}

const PER_BUCKET = 6

export async function GET(req: Request) {
  const { teamId } = await requireSelectedTeam()
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({
      q,
      matches: [],
      players: [],
      opponents: [],
    } satisfies SearchResponse)
  }

  const supabase = createClient()
  const like = `%${q.replace(/[%_]/g, '')}%`

  const [matchesRes, playersRes, oppsRes] = await Promise.all([
    // Matches: hit helldock id, opponent name, map name, notes
    supabase
      .from('matches')
      .select(
        'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result'
      )
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .or(
        `match_id_helldock.ilike.${like},opponent_name.ilike.${like},map_name.ilike.${like},notes.ilike.${like}`
      )
      .order('match_date', { ascending: false })
      .limit(PER_BUCKET),

    // Players on the team's roster (joined via match_players → players,
    // distinct via grouping in code since PostgREST doesn't support distinct).
    supabase
      .from('players')
      .select('id, display_name')
      .ilike('display_name', like)
      .limit(20),

    // Opponents — distinct names. Cheapest path: pull matching match rows,
    // dedupe in code. Limit broad enough to cover decent variations.
    supabase
      .from('matches')
      .select('opponent_name')
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .ilike('opponent_name', like)
      .limit(200),
  ])

  const matches: SearchMatch[] = (matchesRes.data ?? []).map((m) => ({
    id: m.id,
    matchIdHelldock: m.match_id_helldock,
    date: m.match_date,
    opp: m.opponent_name,
    map: m.map_name,
    result: m.result,
    ourScore: m.our_score,
    oppScore: m.opp_score,
  }))

  // Filter player results to those who actually appear on this team's
  // match_players rows; otherwise we'd surface players from other teams.
  const candidateIds = (playersRes.data ?? []).map((p) => p.id)
  let players: SearchPlayer[] = []
  if (candidateIds.length > 0) {
    const { data: teamMatchIds } = await supabase
      .from('matches')
      .select('id')
      .eq('team_id', teamId)
      .is('deleted_at', null)
    const matchIds = (teamMatchIds ?? []).map((x) => x.id)
    if (matchIds.length > 0) {
      const { data: mpRows } = await supabase
        .from('match_players')
        .select('player_id, match_id')
        .in('player_id', candidateIds)
        .in('match_id', matchIds)
      const gamesByPlayer: Record<string, number> = {}
      for (const r of mpRows ?? []) {
        gamesByPlayer[r.player_id] = (gamesByPlayer[r.player_id] ?? 0) + 1
      }
      const nameById = Object.fromEntries(
        (playersRes.data ?? []).map((p) => [p.id, p.display_name])
      )
      players = Object.keys(gamesByPlayer)
        .map((id) => ({
          id,
          name: nameById[id] ?? '—',
          games: gamesByPlayer[id],
        }))
        .sort((a, b) => b.games - a.games)
        .slice(0, PER_BUCKET)
    }
  }

  // Distinct opponents with game counts
  const oppCounts: Record<string, number> = {}
  for (const row of oppsRes.data ?? []) {
    const name = row.opponent_name
    if (!name) continue
    oppCounts[name] = (oppCounts[name] ?? 0) + 1
  }
  const opponents: SearchOpponent[] = Object.keys(oppCounts)
    .map((name) => ({ name, games: oppCounts[name] }))
    .sort((a, b) => b.games - a.games)
    .slice(0, PER_BUCKET)

  return NextResponse.json({
    q,
    matches,
    players,
    opponents,
  } satisfies SearchResponse)
}
