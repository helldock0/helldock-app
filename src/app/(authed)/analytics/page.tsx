import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  computeMapStats,
  computePlayerStats,
  computeOppStats,
  computeRoundStats,
  computeCoachSummary,
  computeCompLab,
  computeCompMatrix,
  computeMapPoolHealth,
  type FullMatchPlayer,
} from '@/lib/analytics'
import type { DashMatch, DashRound } from '@/lib/dashboard'
import { requireSelectedTeam } from '@/lib/team-session'
import { TEAM_CONFIGS } from '@/lib/teams'
import { getMmrForRiotIds, type MmrLookup } from '@/lib/henrik/mmr'
import AnalyticsTabs from './AnalyticsTabs'

export const dynamic = 'force-dynamic'

type TabKey = 'maps' | 'players' | 'opps' | 'rounds' | 'complab' | 'pool'

const VALID_TABS: ReadonlyArray<TabKey> = ['maps', 'players', 'opps', 'rounds', 'complab', 'pool']

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { tab?: string; map?: string; hideAcademy?: string }
}) {
  const { teamId, teamSlug } = await requireSelectedTeam()
  const supabase = createClient()
  const requestedTab = (searchParams.tab ?? 'maps') as TabKey
  const tab: TabKey = (VALID_TABS as readonly string[]).includes(requestedTab) ? requestedTab : 'maps'
  const hideAcademy = searchParams.hideAcademy === '1'

  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents'
    )
    .is('deleted_at', null)
    .eq('team_id', teamId)

  const matches: DashMatch[] = matchesRaw ?? []
  const matchIds = matches.map((m) => m.id)

  // If no matches, short-circuit empty state
  if (matches.length === 0) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">
            analytics
          </p>
          <h1 className="text-3xl font-bold text-gold tracking-tight mb-3">No data yet</h1>
          <p className="text-muted text-sm mb-8">
            Import or log matches to unlock map, player, opp and round breakdowns.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/import"
              className="bg-gold text-black font-semibold px-5 py-2 rounded-lg hover:bg-gold-hover transition-colors text-sm"
            >
              Import matches
            </Link>
            <Link
              href="/matches/new"
              className="border border-line-strong text-fg font-semibold px-5 py-2 rounded-lg hover:border-gold transition-colors text-sm"
            >
              + New Match
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Pull rounds, our players, opp players — all scoped to the matches we have
  const [roundsRes, mpRes, oppRes] = await Promise.all([
    supabase
      .from('rounds')
      .select('match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site, plant_time_in_round, defuse_time_in_round, our_ults_used, their_ults_used')
      .in('match_id', matchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, k, d, acs, plus_minus, agent, fk, fd, plants, defuses, clutches, econ, hs, bs, ls, damage_made, damage_received, adr, ability_c, ability_q, ability_e, ability_x, rounds_afk, friendly_fire_outgoing, friendly_fire_incoming, player:players(display_name)')
      .in('match_id', matchIds),
    supabase
      .from('opp_players')
      .select('match_id, agent, riot_id_full')
      .in('match_id', matchIds),
  ])

  const rounds: DashRound[] = roundsRes.data ?? []
  const matchPlayersRaw = (mpRes.data ?? []) as unknown as FullMatchPlayer[]
  const oppPlayers = (oppRes.data ?? []) as {
    match_id: string
    agent: string | null
    riot_id_full: string | null
  }[]

  // Build opp_name → distinct riot_ids map (for MMR refresh button + chip lookup)
  const matchIdToOpp: Record<string, string | null> = {}
  for (const m of matches) matchIdToOpp[m.id] = m.opponent_name
  const riotIdsByOpp: Record<string, string[]> = {}
  const allRiotIds = new Set<string>()
  for (const op of oppPlayers) {
    const opp = matchIdToOpp[op.match_id]
    if (!opp || !op.riot_id_full || !op.riot_id_full.includes('#')) continue
    riotIdsByOpp[opp] = riotIdsByOpp[opp] ?? []
    if (!riotIdsByOpp[opp].includes(op.riot_id_full)) {
      riotIdsByOpp[opp].push(op.riot_id_full)
    }
    allRiotIds.add(op.riot_id_full)
  }

  // Region for MMR refresh (from team config)
  const teamConfig = TEAM_CONFIGS[teamSlug]
  const region = teamConfig?.mainAccount.region ?? 'ap'

  // Internal-scrim detection: any match where 3+ opp players are on the OTHER academy team's roster.
  const otherRosterKeys = new Set(
    Object.keys(TEAM_CONFIGS)
      .filter((s) => s !== teamSlug)
      .flatMap((s) => Object.keys(TEAM_CONFIGS[s].roster))
  )
  const overlapByMatch: Record<string, number> = {}
  for (const op of oppPlayers) {
    if (op.riot_id_full && otherRosterKeys.has(op.riot_id_full)) {
      overlapByMatch[op.match_id] = (overlapByMatch[op.match_id] ?? 0) + 1
    }
  }
  const internalMatchIds = new Set(
    Object.keys(overlapByMatch).filter((k) => overlapByMatch[k] >= 3)
  )
  const internalCount = internalMatchIds.size

  // Filter datasets if hideAcademy is on (BEFORE computing all derived stats)
  const filteredMatches = hideAcademy
    ? matches.filter((m) => !internalMatchIds.has(m.id))
    : matches
  const filteredRounds = hideAcademy
    ? rounds.filter((r) => !internalMatchIds.has(r.match_id))
    : rounds
  const filteredMatchPlayers = hideAcademy
    ? matchPlayersRaw.filter((mp) => !internalMatchIds.has(mp.match_id))
    : matchPlayersRaw
  const filteredOppPlayers = hideAcademy
    ? oppPlayers.filter((op) => !internalMatchIds.has(op.match_id))
    : oppPlayers

  // Pull cached MMR rows for all visible opp riot_ids
  const ranksByRiotId: Record<string, MmrLookup> =
    allRiotIds.size > 0 ? await getMmrForRiotIds(Array.from(allRiotIds)) : {}

  // Comp Lab map selection: ?map= wins, else most-played, else first map
  const mapsAll = computeMapStats(filteredMatches, filteredRounds)
  const mostPlayed = [...mapsAll].sort((a, b) => b.total - a.total)[0]
  const fallbackMap = mostPlayed && mostPlayed.total > 0 ? mostPlayed.map : mapsAll[0].map
  const compLabMap = searchParams.map && (mapsAll.some((x) => x.map === searchParams.map))
    ? searchParams.map
    : fallbackMap

  // Rounds-tab map filter: ?map= when on rounds tab acts as filter (null = all maps).
  // Reuses same param as CompLab so cross-tab navigation keeps the selection.
  const roundsMapFilter =
    searchParams.map && mapsAll.some((x) => x.map === searchParams.map)
      ? searchParams.map
      : null
  const matchIdToMapName: Record<string, string | null> = {}
  for (const m of filteredMatches) matchIdToMapName[m.id] = m.map_name
  const roundsForStats = roundsMapFilter
    ? filteredRounds.filter((r) => matchIdToMapName[r.match_id] === roundsMapFilter)
    : filteredRounds

  // Compute everything once on the server (using filtered data)
  const players = computePlayerStats(filteredMatches, filteredMatchPlayers)
  const opps = computeOppStats(filteredMatches, filteredOppPlayers)
  const roundsStats = computeRoundStats(roundsForStats)
  const coachSummary = computeCoachSummary(filteredMatches, filteredRounds, filteredMatchPlayers)
  const compLab = computeCompLab(filteredMatches, compLabMap)
  const compMatrix = computeCompMatrix(filteredMatches)
  const mapPool = computeMapPoolHealth(filteredMatches)

  return (
    <main className="px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
          deep dive
        </p>
        <h1 className="text-2xl font-bold text-fg leading-tight mt-1">Analytics</h1>
      </div>

      <AnalyticsTabs
        tab={tab}
        teamSlug={teamSlug}
        maps={mapsAll}
        players={players}
        opps={opps}
        roundsStats={roundsStats}
        coachSummary={coachSummary}
        compLab={compLab}
        compMatrix={compMatrix}
        mapPool={mapPool}
        defaultCompMap={compLabMap}
        roundsMapFilter={roundsMapFilter}
        allMaps={mapsAll}
        riotIdsByOpp={riotIdsByOpp}
        ranksByRiotId={ranksByRiotId}
        region={region}
        hideAcademy={hideAcademy}
        internalCount={internalCount}
      />
    </main>
  )
}

