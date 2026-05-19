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
import type { WPRound } from '@/lib/win-probability'
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
            href="/import"
            className="bg-gold text-black font-semibold px-5 py-2 rounded-lg hover:bg-gold-hover transition-colors text-sm"
          >
            Import matches
          </Link>
        </div>
      </main>
    )
  }

  const matchIds = matches.map((m) => m.id)

  const [roundsRes, mpRes] = await Promise.all([
    supabase
      .from('rounds')
      .select('match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site, our_econ, their_econ')
      .in('match_id', matchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, acs, player:players(display_name, roster_status)')
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

  return (
    <TrendsClient
      rolling={rolling}
      sideWeekly={sideWeekly}
      playerTrends={playerTrends}
      streaks={streaks}
      retro={retro}
      totalMatches={matches.length}
    >
      <ModelHealthPanel rounds={wpRounds} />
    </TrendsClient>
  )
}
