import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  computeRollingWinRate,
  computeWeeklySideBias,
  computePlayerAcsBuckets,
  computeStreaks,
  computeWeeklyRetro,
  type TrendsMatch,
  type TrendsMatchPlayer,
} from '@/lib/trends'
import type { DashRound } from '@/lib/dashboard'
import {
  trainWinProbability,
  type WPRound,
} from '@/lib/win-probability'
import {
  computeRoleImpact,
  pickHighestLeverageMoment,
  type ImpactRoleRound,
  type ImpactRoleMatchPlayer,
  type ImpactRoleKillEvent,
  type ImpactRoleMatch,
  type LeverageMoment,
} from '@/lib/role-impact'
import TrendsClient from './TrendsClient'
import ModelHealthPanel from './ModelHealthPanel'

export const dynamic = 'force-dynamic'

export default async function TrendsPage() {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents, match_type'
    )
    .eq('team_id', teamId)
    .is('deleted_at', null)

  const matches: TrendsMatch[] = matchesRaw ?? []

  if (matches.length === 0) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">
            trends
          </p>
          <h1 className="text-3xl font-bold text-gold tracking-tight mb-3">
            Nothing to trend yet
          </h1>
          <p className="text-muted text-sm mb-8">
            Import or log matches to unlock rolling form, side drift, and player
            ACS curves.
          </p>
          <Link
            href="/app/import"
            className="bg-gold text-black font-semibold px-5 py-2 rounded-lg hover:bg-gold-hover transition-colors text-sm"
          >
            Import matches
          </Link>
        </div>
      </main>
    )
  }

  const matchIds = matches.map((m) => m.id)

  const [roundsRes, mpRes, killRes, mpFullRes] = await Promise.all([
    supabase
      .from('rounds')
      .select('match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site, our_econ, their_econ')
      .in('match_id', matchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, acs, player:players(display_name, roster_status)')
      .in('match_id', matchIds),
    supabase
      .from('kill_events')
      .select('match_id, round_num, killer_puuid, victim_puuid, killer_is_ours, is_first_blood')
      .in('match_id', matchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, puuid, riot_name, player:players(display_name, roster_status)')
      .in('match_id', matchIds),
  ])
  const roundsAll = (roundsRes.data ?? []) as Array<
    DashRound & { our_econ?: number | null; their_econ?: number | null }
  >
  const rounds: DashRound[] = roundsAll
  // C1 — typed slice for WP model training (server-side calibration panel).
  const wpRounds: WPRound[] = roundsAll.map((r) => ({
    match_id: r.match_id,
    round_num: r.round_num,
    side: r.side,
    outcome: r.outcome,
    round_type: r.round_type,
    our_econ: r.our_econ ?? null,
    their_econ: r.their_econ ?? null,
  }))
  // Trials are excluded from team aggregates.
  const matchPlayers = ((mpRes.data ?? []) as unknown as Array<
    TrendsMatchPlayer & { player?: { roster_status?: string } | null }
  >).filter((p) => p.player?.roster_status !== 'trial') as TrendsMatchPlayer[]

  const rolling = computeRollingWinRate(matches, 30)
  const sideWeekly = computeWeeklySideBias(matches, rounds, 12)
  const playerTrends = computePlayerAcsBuckets(matches, matchPlayers, 5)
  const streaks = computeStreaks(matches)
  const retro = computeWeeklyRetro(matches, rounds, matchPlayers)

  // S26 — Highest-leverage moment of the last 7 days.
  let highestLeverageMoment: LeverageMoment | null = null
  const wpModel = trainWinProbability(wpRounds)
  if (wpModel) {
    const roleRounds: ImpactRoleRound[] = roundsAll.map((r) => ({
      match_id: r.match_id,
      round_num: r.round_num,
      side: r.side,
      outcome: r.outcome,
      round_type: r.round_type,
      our_econ: r.our_econ ?? null,
      their_econ: r.their_econ ?? null,
      clutch_type: r.clutch_type ?? null,
      clutch_player: r.clutch_player ?? null,
    }))
    const mpFullRaw = (mpFullRes.data ?? []) as unknown as Array<{
      match_id: string
      player_id: string | null
      puuid: string | null
      riot_name: string | null
      player: { display_name: string; roster_status?: string } | null
    }>
    const roleMatchPlayers: ImpactRoleMatchPlayer[] = mpFullRaw
      .filter((mp) => mp.player?.roster_status !== 'trial')
      .map((mp) => ({
        match_id: mp.match_id,
        player_id: mp.player_id,
        puuid: mp.puuid,
        display_name: mp.player?.display_name ?? null,
        riot_name: mp.riot_name,
      }))
    const roleKillEvents = (killRes.data ?? []) as ImpactRoleKillEvent[]
    const roleMatches: ImpactRoleMatch[] = matches.map((m) => ({
      id: m.id,
      match_id_helldock: m.match_id_helldock,
      opponent_name: m.opponent_name,
      match_date: m.match_date,
    }))
    const role = computeRoleImpact(
      roleMatchPlayers,
      roleRounds,
      roleKillEvents,
      roleMatches,
      wpModel.weights
    )
    // Look back 7 days from today (use the latest match_date as anchor to
    // tolerate clocks; fall back to wall time if matches are sparse).
    const today = new Date().toISOString().slice(0, 10)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    void today
    highestLeverageMoment = pickHighestLeverageMoment(role.moments, sevenDaysAgo)
  }

  return (
    <TrendsClient
      rolling={rolling}
      sideWeekly={sideWeekly}
      playerTrends={playerTrends}
      streaks={streaks}
      retro={retro}
      totalMatches={matches.length}
      highestLeverageMoment={highestLeverageMoment}
    >
      <ModelHealthPanel rounds={wpRounds} />
    </TrendsClient>
  )
}
