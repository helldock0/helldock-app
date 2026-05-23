import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MatchDetail from './MatchDetail'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  trainWinProbability,
  computeMatchWinProbabilities,
  type WPRound,
} from '@/lib/win-probability'
import {
  computeReviewQueue,
  type ReviewQueueRound,
} from '@/lib/review-queue'

const VALID_TABS = ['Review', 'Overview', 'Rounds', 'Heatmap', 'Players', 'Opp Players'] as const
type ValidTab = (typeof VALID_TABS)[number]

function parseTab(raw: string | undefined): ValidTab | undefined {
  return VALID_TABS.find((t) => t === raw)
}

function parseRound(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? n : undefined
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: { matchId: string }
  searchParams: { edit?: string; tab?: string; round?: string }
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
    { data: rosterPlayers },
    { data: killEvents },
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
    supabase
      .from('players')
      .select('id, display_name, roster_status')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('roster_status')
      .order('display_name'),
    supabase
      .from('kill_events')
      .select('killer_x, killer_y, victim_x, victim_y, killer_is_ours')
      .eq('match_id', match.id),
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

  // Review queue — composes WP surprise/leverage with clutch/grade/tag signals
  // into a top-5 "look here first" list. Pure compute, no extra DB round-trip.
  const reviewItems = computeReviewQueue({
    rounds: (rounds ?? []).map(
      (r): ReviewQueueRound => ({
        round_num: r.round_num,
        side: r.side,
        outcome: r.outcome,
        round_type: r.round_type,
        our_econ: r.our_econ,
        their_econ: r.their_econ,
        first_blood: r.first_blood,
        clutch_type: r.clutch_type,
        clutch_player: r.clutch_player,
        coach_grade: r.coach_grade,
        coach_tags: r.coach_tags,
      })
    ),
    wpWeights: wpModel?.weights ?? null,
    topN: 5,
  })

  return (
    <MatchDetail
      match={match}
      rounds={rounds ?? []}
      matchPlayers={matchPlayers ?? []}
      oppPlayers={oppPlayers ?? []}
      initialEdit={searchParams.edit === '1'}
      initialTab={parseTab(searchParams.tab)}
      initialFlashRound={parseRound(searchParams.round)}
      roundWPs={wpForThisMatch}
      killEvents={killEvents ?? []}
      reviewItems={reviewItems}
      wpModelTrainSize={wpModel?.trainSize ?? 0}
      rosterOptions={(rosterPlayers ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        roster_status: (p.roster_status ?? 'main') as 'main' | 'sub' | 'trial',
      }))}
    />
  )
}
