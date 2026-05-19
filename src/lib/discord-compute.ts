// Pure compute + DB query helpers for the Discord match-summary embed.
//
// Kept separate from `discord.ts` (which only knows about embed/multipart
// shapes) so these helpers can be unit-tested without touching the webhook
// network path. All DB helpers swallow errors and return `null` — the caller
// degrades gracefully to a less-rich post.

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStreaks } from '@/lib/trends'

// ── Tactical breakdown ───────────────────────────────────────────────────────

export type TacticalBreakdown = {
  halves: {
    h1: { w: number; l: number }
    h2: { w: number; l: number }
    ot?: { w: number; l: number }
  } | null
  pistol: { w: number; l: number } | null
  att: {
    w: number
    l: number
    plantRatePct: number | null
    avgPlantSec: number | null
  } | null
  def: {
    w: number
    l: number
    defuseRatePct: number | null
    avgDefuseSec: number | null
  } | null
  byBuyType: Array<{
    type: 'Pistol' | 'Eco' | 'Anti-Eco' | 'Bonus' | 'Full Buy'
    w: number
    l: number
  }> | null
  sites: {
    A: { wins: number; total: number }
    B: { wins: number; total: number }
    C: { wins: number; total: number }
  } | null
  ults: { us: number; them: number } | null
}

export type RoundForBreakdown = {
  round_num: number | null
  side: string | null
  outcome: string | null
  round_type: string | null
  site: string | null
  plant_time_in_round: number | null
  defuse_time_in_round: number | null
  our_ults_used: number | null
  their_ults_used: number | null
}

const BUY_TYPES = ['Pistol', 'Eco', 'Anti-Eco', 'Bonus', 'Full Buy'] as const

export function computeTacticalBreakdown(
  rounds: RoundForBreakdown[]
): TacticalBreakdown {
  if (!rounds.length) {
    return {
      halves: null,
      pistol: null,
      att: null,
      def: null,
      byBuyType: null,
      sites: null,
      ults: null,
    }
  }

  let h1W = 0,
    h1L = 0,
    h2W = 0,
    h2L = 0,
    otW = 0,
    otL = 0,
    hasOt = false
  let pistolW = 0,
    pistolL = 0,
    hasPistol = false
  let attW = 0,
    attL = 0,
    attTotal = 0,
    attPlants = 0,
    plantSecSum = 0,
    plantSecN = 0
  let defW = 0,
    defL = 0,
    defTotal = 0,
    defDefuses = 0,
    defuseSecSum = 0,
    defuseSecN = 0
  const buyAcc: Record<string, { w: number; l: number }> = {}
  const sitesAcc: Record<'A' | 'B' | 'C', { wins: number; total: number }> = {
    A: { wins: 0, total: 0 },
    B: { wins: 0, total: 0 },
    C: { wins: 0, total: 0 },
  }
  let ourUlts = 0,
    theirUlts = 0,
    hasUlts = false

  for (const r of rounds) {
    const won = r.outcome === 'W'
    const lost = r.outcome === 'L'

    // Halves (1-12 = H1, 13-24 = H2, 25+ = OT)
    if (r.round_num != null && (won || lost)) {
      if (r.round_num <= 12) {
        if (won) h1W++
        else h1L++
      } else if (r.round_num <= 24) {
        if (won) h2W++
        else h2L++
      } else {
        hasOt = true
        if (won) otW++
        else otL++
      }
    }

    // Pistol
    if (r.round_type === 'Pistol' && (won || lost)) {
      hasPistol = true
      if (won) pistolW++
      else pistolL++
    }

    // ATT / DEF
    if (r.side === 'Attack' && (won || lost)) {
      if (won) attW++
      else attL++
      attTotal++
      if (r.plant_time_in_round != null) {
        attPlants++
        plantSecSum += r.plant_time_in_round
        plantSecN++
      }
      if (won && r.site && (r.site === 'A' || r.site === 'B' || r.site === 'C')) {
        sitesAcc[r.site].wins++
        sitesAcc[r.site].total++
      } else if (
        r.site &&
        (r.site === 'A' || r.site === 'B' || r.site === 'C') &&
        r.plant_time_in_round != null
      ) {
        // We planted but didn't win the round — still counts toward "site exec total"
        sitesAcc[r.site].total++
      }
    } else if (r.side === 'Defense' && (won || lost)) {
      if (won) defW++
      else defL++
      defTotal++
      if (r.defuse_time_in_round != null) {
        defDefuses++
        defuseSecSum += r.defuse_time_in_round
        defuseSecN++
      }
    }

    // Buy types
    if (r.round_type && (won || lost)) {
      const bucket = (buyAcc[r.round_type] ??= { w: 0, l: 0 })
      if (won) bucket.w++
      else bucket.l++
    }

    // Ults
    if (r.our_ults_used != null || r.their_ults_used != null) {
      hasUlts = true
      ourUlts += Math.max(0, r.our_ults_used ?? 0)
      theirUlts += Math.max(0, r.their_ults_used ?? 0)
    }
  }

  const anyOutcome = h1W + h1L + h2W + h2L + otW + otL > 0

  const byBuyType: TacticalBreakdown['byBuyType'] = []
  for (const t of BUY_TYPES) {
    const bucket = buyAcc[t]
    if (bucket && bucket.w + bucket.l > 0) {
      byBuyType.push({ type: t, w: bucket.w, l: bucket.l })
    }
  }

  const sitesNonEmpty =
    sitesAcc.A.total + sitesAcc.B.total + sitesAcc.C.total > 0

  return {
    halves: anyOutcome
      ? {
          h1: { w: h1W, l: h1L },
          h2: { w: h2W, l: h2L },
          ...(hasOt ? { ot: { w: otW, l: otL } } : {}),
        }
      : null,
    pistol: hasPistol ? { w: pistolW, l: pistolL } : null,
    att:
      attTotal > 0
        ? {
            w: attW,
            l: attL,
            plantRatePct: Math.round((attPlants / attTotal) * 100),
            avgPlantSec: plantSecN > 0 ? Math.round(plantSecSum / plantSecN) : null,
          }
        : null,
    def:
      defTotal > 0
        ? {
            w: defW,
            l: defL,
            defuseRatePct: Math.round((defDefuses / defTotal) * 100),
            avgDefuseSec:
              defuseSecN > 0 ? Math.round(defuseSecSum / defuseSecN) : null,
          }
        : null,
    byBuyType: byBuyType.length ? byBuyType : null,
    sites: sitesNonEmpty ? sitesAcc : null,
    ults: hasUlts ? { us: ourUlts, them: theirUlts } : null,
  }
}

// ── Streak ───────────────────────────────────────────────────────────────────

export type StreakForMatch = {
  kind: 'W' | 'L'
  length: number
  /** true if this match continued an existing streak (length > 1) */
  extended: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = SupabaseClient | any

/**
 * Pull the team's recent W/L history (including this match) and compute the
 * current streak that ends at this match. Returns null if fewer than 1 match
 * is found or the call fails.
 */
export async function computeStreakForMatch(
  supabase: SupabaseLike,
  teamId: string
): Promise<StreakForMatch | null> {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents')
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .in('result', ['W', 'L'])
      .order('match_date', { ascending: false })
      .limit(30)
    if (error || !data || data.length === 0) return null

    // computeStreaks sorts ascending internally; pass the slice as-is.
    const streaks = computeStreaks(
      data.map((m: { match_date: string; result: string | null }) => ({
        id: '',
        match_id_helldock: '',
        match_date: m.match_date,
        opponent_name: null,
        map_name: null,
        our_score: null,
        opp_score: null,
        result: m.result,
        our_agents: null,
      }))
    )
    if (streaks.current.kind === 'none') return null
    return {
      kind: streaks.current.kind,
      length: streaks.current.length,
      extended: streaks.current.length > 1,
    }
  } catch {
    return null
  }
}

// ── Map history ──────────────────────────────────────────────────────────────

export type MapHistorySnapshot = {
  mapName: string
  wins: number
  total: number
  windowLabel: string
}

/**
 * Last `windowSize` plays on this map (excluding the just-inserted match) for
 * this team. Returns null if no prior plays exist or the call fails.
 */
export async function computeMapHistory(
  supabase: SupabaseLike,
  teamId: string,
  mapName: string,
  excludeMatchUUID: string,
  windowSize = 7
): Promise<MapHistorySnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('result')
      .eq('team_id', teamId)
      .eq('map_name', mapName)
      .neq('id', excludeMatchUUID)
      .is('deleted_at', null)
      .in('result', ['W', 'L'])
      .order('match_date', { ascending: false })
      .limit(windowSize)
    if (error || !data || data.length === 0) return null
    const wins = data.filter((r: { result: string | null }) => r.result === 'W').length
    return {
      mapName,
      wins,
      total: data.length,
      windowLabel: `last ${data.length} play${data.length === 1 ? '' : 's'}`,
    }
  } catch {
    return null
  }
}

// ── Per-player ACS vs rolling avg ────────────────────────────────────────────

export type PlayerDelta = {
  name: string
  acs: number | null
  acsDelta: number | null
}

export type MatchPlayerForDelta = {
  player_id: string | null
  acs: number | null
  display_name: string
}

const PLAYER_AVG_WINDOW = 10
const MIN_PRIOR_FOR_DELTA = 3

/**
 * For each of the 5 (or fewer) match players: query their last 10 prior
 * match_players rows for this team and compute the ACS delta vs their rolling
 * avg. Returns array sorted by raw ACS desc.
 */
export async function computePlayerAcsDelta(
  supabase: SupabaseLike,
  teamId: string,
  matchPlayers: MatchPlayerForDelta[],
  excludeMatchUUID: string
): Promise<PlayerDelta[]> {
  const sorted = [...matchPlayers].sort(
    (a, b) => (b.acs ?? -1) - (a.acs ?? -1)
  )

  const deltas = await Promise.all(
    sorted.map(async (mp): Promise<PlayerDelta> => {
      if (!mp.player_id || mp.acs == null) {
        return { name: mp.display_name, acs: mp.acs, acsDelta: null }
      }
      try {
        // Join through matches to scope to team + exclude this match. We pull
        // a window slightly larger than needed in case some rows have null ACS.
        const { data, error } = await supabase
          .from('match_players')
          .select('acs, match:matches!inner(id, team_id, match_date, deleted_at)')
          .eq('player_id', mp.player_id)
          .eq('match.team_id', teamId)
          .is('match.deleted_at', null)
          .neq('match_id', excludeMatchUUID)
          .order('match(match_date)', { ascending: false })
          .limit(PLAYER_AVG_WINDOW * 2)
        if (error || !data) {
          return { name: mp.display_name, acs: mp.acs, acsDelta: null }
        }
        const acsValues = data
          .map((r: { acs: number | null }) => r.acs)
          .filter((v: number | null): v is number => v != null)
          .slice(0, PLAYER_AVG_WINDOW)
        if (acsValues.length < MIN_PRIOR_FOR_DELTA) {
          return { name: mp.display_name, acs: mp.acs, acsDelta: null }
        }
        const avg =
          acsValues.reduce((s: number, v: number) => s + v, 0) / acsValues.length
        return {
          name: mp.display_name,
          acs: mp.acs,
          acsDelta: Math.round(mp.acs - avg),
        }
      } catch {
        return { name: mp.display_name, acs: mp.acs, acsDelta: null }
      }
    })
  )

  return deltas
}
