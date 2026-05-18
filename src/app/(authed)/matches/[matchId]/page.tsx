import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MatchDetail from './MatchDetail'
import { requireSelectedTeam } from '@/lib/team-session'

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

  const [{ data: rounds }, { data: matchPlayers }, { data: oppPlayers }] = await Promise.all([
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
  ])

  return (
    <MatchDetail
      match={match}
      rounds={rounds ?? []}
      matchPlayers={matchPlayers ?? []}
      oppPlayers={oppPlayers ?? []}
      initialEdit={searchParams.edit === '1'}
    />
  )
}
