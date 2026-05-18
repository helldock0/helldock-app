import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MatchDetail from './MatchDetail'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  trainWinProbability,
  computeMatchWinProbabilities,
  type WPRound,
} from '@/lib/win-probability'

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: { matchId: string }
  searchParams: { edit?: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('match_id_helldock', params.matchId)
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .single()

  if (!match) notFound()

  // Pull the active match's rounds/players AND the team's full historical
  // rounds (just the columns needed for WP training). The historical pull is
  // small (~500 rows × ~8 columns); training takes <50ms.
  const [
    { data: rounds },
    { data: matchPlayers },
    { data: oppPlayers },
    { data: teamMatchIds },
  ] = await Promise.all([
    supabase
      .from('rounds')
      .select('*')
      .eq('match_id', match.id)
      .order('round_num'),
    supabase
      .from('match_players')
      .select('*, player:players(display_name)')
      .eq('match_id', match.id),
    supabase
      .from('opp_players')
      .select('*')
      .eq('match_id', match.id),
    supabase
      .from('matches')
      .select('id')
      .eq('team_id', teamId)
      .is('deleted_at', null),
  ])

  const allTeamMatchIds = (teamMatchIds ?? []).map((m) => m.id)
  const { data: historicalRounds } = await supabase
    .from('rounds')
    .select('match_id, round_num, side, outcome, round_type, our_econ, their_econ')
    .in('match_id', allTeamMatchIds)

  const wpInput: WPRound[] = (historicalRounds ?? []) as WPRound[]
  const wpModel = trainWinProbability(wpInput)
  const wpForThisMatch = wpModel
    ? computeMatchWinProbabilities(
        wpModel.weights,
        (rounds ?? []).map((r) => ({
          match_id: r.match_id,
          round_num: r.round_num,
          side: r.side,
          outcome: r.outcome,
          round_type: r.round_type,
          our_econ: r.our_econ,
          their_econ: r.their_econ,
        }))
      )
    : []

  return (
    <MatchDetail
      match={match}
      rounds={rounds ?? []}
      matchPlayers={matchPlayers ?? []}
      oppPlayers={oppPlayers ?? []}
      initialEdit={searchParams.edit === '1'}
      roundWPs={wpForThisMatch}
    />
  )
}
