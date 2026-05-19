import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  computeOpponentDossier,
  type DossierMatch,
  type DossierOppPlayer,
  type DossierMatchPlayer,
} from '@/lib/opponent-dossier'
import type { DashRound } from '@/lib/dashboard'
import PrepClient from './PrepClient'

export const dynamic = 'force-dynamic'

export default async function PrepPage({
  searchParams,
}: {
  searchParams: { opp?: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const oppName = (searchParams.opp ?? '').trim()

  if (!oppName) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">
            prep checklist
          </p>
          <h1 className="text-3xl font-bold text-gold tracking-tight mb-3">
            Pick an opponent
          </h1>
          <p className="text-muted text-sm mb-6">
            Open the Opponents tab, expand any opponent, and click 🧾 Prep.
          </p>
          <Link
            href="/analytics?tab=opps"
            className="bg-gold text-black font-semibold px-5 py-2 rounded-lg hover:bg-gold-hover transition-colors text-sm"
          >
            Browse opponents
          </Link>
        </div>
      </main>
    )
  }

  const supabase = createClient()

  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents, opp_agents, pick, start_side'
    )
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .ilike('opponent_name', oppName)

  const matches: DossierMatch[] = matchesRaw ?? []

  if (matches.length === 0) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">
            prep checklist
          </p>
          <h1 className="text-3xl font-bold text-fg tracking-tight mb-3">
            No prior data on “{oppName}”
          </h1>
          <p className="text-muted text-sm mb-6">
            Once you log a match against them, the checklist will populate.
          </p>
          <Link
            href="/analytics?tab=opps"
            className="border border-line-strong text-fg font-semibold px-5 py-2 rounded-lg hover:border-gold transition-colors text-sm"
          >
            Back to opponents
          </Link>
        </div>
      </main>
    )
  }
  const matchIds = matches.map((m) => m.id)

  const [roundsRes, mpRes, opRes] = await Promise.all([
    supabase
      .from('rounds')
      .select(
        'match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site, plant_time_in_round, defuse_time_in_round, our_ults_used, their_ults_used'
      )
      .in('match_id', matchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, agent, acs, player:players(display_name, roster_status)')
      .in('match_id', matchIds),
    supabase
      .from('opp_players')
      .select('match_id, agent, riot_id_full, opp_player_name, acs, k, d')
      .in('match_id', matchIds),
  ])

  const rounds: DashRound[] = roundsRes.data ?? []
  // Trials are excluded from team aggregates.
  const mpRaw = ((mpRes.data ?? []) as unknown as {
    match_id: string
    player_id: string
    agent: string | null
    acs: number | null
    player: { display_name: string; roster_status?: string } | null
  }[]).filter((p) => p.player?.roster_status !== 'trial')
  const matchPlayers: DossierMatchPlayer[] = mpRaw.map((mp) => ({
    match_id: mp.match_id,
    player_id: mp.player_id,
    agent: mp.agent,
    acs: mp.acs,
    display_name: mp.player?.display_name ?? null,
  }))
  const oppPlayers = (opRes.data ?? []) as DossierOppPlayer[]

  const dossier = computeOpponentDossier(
    oppName,
    matches,
    rounds,
    matchPlayers,
    oppPlayers
  )
  if (!dossier) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-muted">
        Could not compute dossier.
      </main>
    )
  }

  return <PrepClient dossier={dossier} />
}
