import {
  type DashMatch,
  type DashRound,
  type DashMatchPlayer,
  mapWinStats,
  isWithinDays,
  pct,
} from './dashboard'
import { MAPS, AGENT_TO_ROLE, type Map as ValMap, type Role } from './valorant'

// ── Shared classifiers ──────────────────────────────────────────────────────

export type Archetype =
  | 'Standard'
  | 'Double Init'
  | 'Double Controller'
  | 'Double Duelist'
  | 'Double Sentinel'
  | 'No Sentinel'
  | 'No Duelist'
  | 'Triple Init'
  | 'Custom'

export function classifyArchetype(agents: string[]): Archetype {
  if (!agents || agents.length === 0) return 'Custom'
  const roleCounts: Record<Role, number> = {
    Duelist: 0,
    Initiator: 0,
    Controller: 0,
    Sentinel: 0,
  }
  let unknown = 0
  for (const a of agents) {
    const r = AGENT_TO_ROLE[a]
    if (r) roleCounts[r]++
    else unknown++
  }
  if (unknown > 0) return 'Custom'
  if (roleCounts.Initiator >= 3) return 'Triple Init'
  // Standard 1-2-1-1: 1 Duelist · 2 Initiator · 1 Controller · 1 Sentinel
  if (
    roleCounts.Duelist === 1 &&
    roleCounts.Initiator === 2 &&
    roleCounts.Controller === 1 &&
    roleCounts.Sentinel === 1
  ) {
    return 'Standard'
  }
  if (roleCounts.Initiator === 2) return 'Double Init'
  if (roleCounts.Controller === 2) return 'Double Controller'
  if (roleCounts.Duelist === 2) return 'Double Duelist'
  if (roleCounts.Sentinel === 2) return 'Double Sentinel'
  if (roleCounts.Sentinel === 0) return 'No Sentinel'
  if (roleCounts.Duelist === 0) return 'No Duelist'
  return 'Custom'
}

export type MapTier = 'S' | 'A' | 'B' | 'C' | 'DEV'

export function classifyMapTier(stats: { wins: number; total: number }): MapTier {
  if (stats.total < 3) return 'DEV'
  const winPct = (stats.wins / stats.total) * 100
  if (winPct >= 75 && stats.total >= 5) return 'S'
  if (winPct >= 60) return 'A'
  if (winPct >= 40) return 'B'
  return 'C'
}

export function tierRecommendation(tier: MapTier): 'Pick' | 'Decider' | 'Ban' | 'Develop' {
  if (tier === 'S' || tier === 'A') return 'Pick'
  if (tier === 'B') return 'Decider'
  if (tier === 'C') return 'Ban'
  return 'Develop'
}

export function computeRating(mp: { k: number | null; a: number | null; d: number | null }): number | null {
  if (mp.k == null || mp.d == null || mp.a == null) return null
  const denom = Math.max(mp.d, 1)
  return Math.round(((mp.k + 0.5 * mp.a) / denom) * 100) / 100
}

// ── Maps ────────────────────────────────────────────────────────────────────

export type MapStat = {
  map: ValMap
  total: number
  wins: number
  losses: number
  winPct: number | null
  attWins: number
  attTotal: number
  attPct: number | null
  defWins: number
  defTotal: number
  defPct: number | null
  pistolAttPct: number | null
  pistolAttTotal: number
  pistolDefPct: number | null
  pistolDefTotal: number
  antiEcoPct: number | null
  antiEcoTotal: number
  ecoPct: number | null
  ecoTotal: number
  bonusPct: number | null
  bonusTotal: number
  aSiteExecPct: number | null
  aSiteExecTotal: number
  bSiteExecPct: number | null
  bSiteExecTotal: number
  cSiteExecPct: number | null
  cSiteExecTotal: number
  avgFor: number | null
  avgAgainst: number | null
  tier: MapTier
  topComps: { agents: string[]; archetype: Archetype; wins: number; total: number }[] // top 3
}

export function computeMapStats(
  matches: DashMatch[],
  rounds: DashRound[]
): MapStat[] {
  const winsByMap = mapWinStats(matches)
  const matchIdToMap: Record<string, string> = {}
  for (const m of matches) {
    if (m.map_name) matchIdToMap[m.id] = m.map_name
  }

  // Side + pistol + round-type + site aggregations per map
  type MapAgg = {
    attW: number; attT: number; defW: number; defT: number
    pistolAttW: number; pistolAttT: number; pistolDefW: number; pistolDefT: number
    antiEcoW: number; antiEcoT: number
    ecoW: number; ecoT: number
    bonusW: number; bonusT: number
    aW: number; aT: number; bW: number; bT: number; cW: number; cT: number
  }
  function emptyMapAgg(): MapAgg {
    return {
      attW: 0, attT: 0, defW: 0, defT: 0,
      pistolAttW: 0, pistolAttT: 0, pistolDefW: 0, pistolDefT: 0,
      antiEcoW: 0, antiEcoT: 0, ecoW: 0, ecoT: 0, bonusW: 0, bonusT: 0,
      aW: 0, aT: 0, bW: 0, bT: 0, cW: 0, cT: 0,
    }
  }

  const agg: Record<string, MapAgg> = {}
  for (const r of rounds) {
    const map = matchIdToMap[r.match_id]
    if (!map) continue
    const a = agg[map] ?? emptyMapAgg()

    if (r.side && r.outcome) {
      if (r.side === 'Attack') {
        a.attT++; if (r.outcome === 'W') a.attW++
        if (r.round_type === 'Pistol') {
          a.pistolAttT++; if (r.outcome === 'W') a.pistolAttW++
        }
      } else if (r.side === 'Defense') {
        a.defT++; if (r.outcome === 'W') a.defW++
        if (r.round_type === 'Pistol') {
          a.pistolDefT++; if (r.outcome === 'W') a.pistolDefW++
        }
      }
    }

    if (r.outcome) {
      if (r.round_type === 'Anti-Eco') { a.antiEcoT++; if (r.outcome === 'W') a.antiEcoW++ }
      else if (r.round_type === 'Eco') { a.ecoT++; if (r.outcome === 'W') a.ecoW++ }
      else if (r.round_type === 'Bonus') { a.bonusT++; if (r.outcome === 'W') a.bonusW++ }
    }

    // Site execute = ATT round where bomb was planted at that site → outcome
    if (r.outcome && r.side === 'Attack' && r.site && r.site !== 'N/A') {
      if (r.site === 'A') { a.aT++; if (r.outcome === 'W') a.aW++ }
      else if (r.site === 'B') { a.bT++; if (r.outcome === 'W') a.bW++ }
      else if (r.site === 'C') { a.cT++; if (r.outcome === 'W') a.cW++ }
    }

    agg[map] = a
  }

  // Avg For / Against per map (computed from matches, not rounds)
  const scoreAgg: Record<string, { forSum: number; agSum: number; n: number }> = {}
  for (const m of matches) {
    if (!m.map_name || m.our_score == null || m.opp_score == null) continue
    const s = scoreAgg[m.map_name] ?? { forSum: 0, agSum: 0, n: 0 }
    s.forSum += m.our_score
    s.agSum += m.opp_score
    s.n++
    scoreAgg[m.map_name] = s
  }

  // Comp counts per map
  const compAgg: Record<string, Record<string, { agents: string[]; wins: number; total: number }>> = {}
  for (const m of matches) {
    if (!m.map_name || !m.our_agents || m.our_agents.length === 0) continue
    const sorted = [...m.our_agents].sort()
    const key = sorted.join(',')
    compAgg[m.map_name] = compAgg[m.map_name] ?? {}
    const cur = compAgg[m.map_name][key] ?? { agents: sorted, wins: 0, total: 0 }
    cur.total++
    if (m.result === 'W') cur.wins++
    compAgg[m.map_name][key] = cur
  }

  return MAPS.map((map) => {
    const w = winsByMap[map]?.wins ?? 0
    const t = winsByMap[map]?.total ?? 0
    const a = agg[map] ?? emptyMapAgg()
    const score = scoreAgg[map]
    const comps = compAgg[map] ? Object.values(compAgg[map]) : []
    comps.sort((x, y) => y.total - x.total || y.wins - x.wins)
    const topComps = comps.slice(0, 3).map((c) => ({
      agents: c.agents,
      archetype: classifyArchetype(c.agents),
      wins: c.wins,
      total: c.total,
    }))
    return {
      map,
      total: t,
      wins: w,
      losses: t - w,
      winPct: pct(w, t),
      attWins: a.attW,
      attTotal: a.attT,
      attPct: pct(a.attW, a.attT),
      defWins: a.defW,
      defTotal: a.defT,
      defPct: pct(a.defW, a.defT),
      pistolAttPct: pct(a.pistolAttW, a.pistolAttT),
      pistolAttTotal: a.pistolAttT,
      pistolDefPct: pct(a.pistolDefW, a.pistolDefT),
      pistolDefTotal: a.pistolDefT,
      antiEcoPct: pct(a.antiEcoW, a.antiEcoT),
      antiEcoTotal: a.antiEcoT,
      ecoPct: pct(a.ecoW, a.ecoT),
      ecoTotal: a.ecoT,
      bonusPct: pct(a.bonusW, a.bonusT),
      bonusTotal: a.bonusT,
      aSiteExecPct: pct(a.aW, a.aT),
      aSiteExecTotal: a.aT,
      bSiteExecPct: pct(a.bW, a.bT),
      bSiteExecTotal: a.bT,
      cSiteExecPct: pct(a.cW, a.cT),
      cSiteExecTotal: a.cT,
      avgFor: score ? Math.round((score.forSum / score.n) * 10) / 10 : null,
      avgAgainst: score ? Math.round((score.agSum / score.n) * 10) / 10 : null,
      tier: classifyMapTier({ wins: w, total: t }),
      topComps,
    }
  })
}

// ── Players ─────────────────────────────────────────────────────────────────

export type PlayerStat = {
  playerId: string
  name: string
  games: number
  avgAcs: number | null
  avgKd: number | null
  avgPlusMinus: number | null
  bestMap: { map: string; winPct: number; games: number } | null
  topAgent: { agent: string; count: number } | null
  acsDelta7d: number | null // (7d avg ACS) − (all-time avg ACS)
  perMapAcs: { map: string; games: number; avgAcs: number | null }[]
  // Extended (from Phase A enriched importer; nullable for old un-rehydrated matches)
  avgFk: number | null
  avgFd: number | null
  avgPlants: number | null
  avgDefuses: number | null
  avgClutches: number | null
  avgEcon: number | null
  avgRating: number | null
  // V4 additions (Phase 1+2)
  avgAdr: number | null
  hsPct: number | null
  avgUtilCasts: number | null
  avgC: number | null
  avgQ: number | null
  avgE: number | null
  avgX: number | null
  totalAfkRounds: number | null
  totalFfOutgoing: number | null
}

export type FullMatchPlayer = DashMatchPlayer & {
  k: number | null
  d: number | null
  plus_minus: number | null
  agent: string | null
  fk: number | null
  fd: number | null
  plants: number | null
  defuses: number | null
  clutches: number | null
  econ: number | null
  // V4 additions (optional — older rows may not have them)
  hs?: number | null
  bs?: number | null
  ls?: number | null
  damage_made?: number | null
  damage_received?: number | null
  adr?: number | null
  ability_c?: number | null
  ability_q?: number | null
  ability_e?: number | null
  ability_x?: number | null
  rounds_afk?: number | null
  friendly_fire_outgoing?: number | null
  friendly_fire_incoming?: number | null
}

export function computePlayerStats(
  matches: DashMatch[],
  matchPlayers: FullMatchPlayer[]
): PlayerStat[] {
  const matchIdToMap: Record<string, string | null> = {}
  const matchIdToResult: Record<string, string | null> = {}
  const matchIdToDate: Record<string, string> = {}
  for (const m of matches) {
    matchIdToMap[m.id] = m.map_name
    matchIdToResult[m.id] = m.result
    matchIdToDate[m.id] = m.match_date
  }

  // Aggregate per player
  type PlayerAgg = {
    name: string
    games: number
    acsSum: number
    acsN: number
    kSum: number
    dSum: number
    pmSum: number
    pmN: number
    acsRecent: { sum: number; n: number }
    perMap: Record<string, { games: number; wins: number; acsSum: number; acsN: number }>
    agentCounts: Record<string, number>
    fkSum: number; fkN: number
    fdSum: number; fdN: number
    plantsSum: number; plantsN: number
    defusesSum: number; defusesN: number
    clutchesSum: number; clutchesN: number
    econSum: number; econN: number
    ratingSum: number; ratingN: number
    // V4 aggregates
    adrSum: number; adrN: number
    hsSum: number; bsSum: number; lsSum: number; shotsN: number
    cSum: number; cN: number
    qSum: number; qN: number
    eSum: number; eN: number
    xSum: number; xN: number
    afkSum: number; afkN: number
    ffOutSum: number; ffOutN: number
  }
  const agg: Record<string, PlayerAgg> = {}

  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.player) continue
    const a = agg[mp.player_id] ?? {
      name: mp.player.display_name,
      games: 0,
      acsSum: 0,
      acsN: 0,
      kSum: 0,
      dSum: 0,
      pmSum: 0,
      pmN: 0,
      acsRecent: { sum: 0, n: 0 },
      perMap: {},
      agentCounts: {},
      fkSum: 0, fkN: 0,
      fdSum: 0, fdN: 0,
      plantsSum: 0, plantsN: 0,
      defusesSum: 0, defusesN: 0,
      clutchesSum: 0, clutchesN: 0,
      econSum: 0, econN: 0,
      ratingSum: 0, ratingN: 0,
      adrSum: 0, adrN: 0,
      hsSum: 0, bsSum: 0, lsSum: 0, shotsN: 0,
      cSum: 0, cN: 0,
      qSum: 0, qN: 0,
      eSum: 0, eN: 0,
      xSum: 0, xN: 0,
      afkSum: 0, afkN: 0,
      ffOutSum: 0, ffOutN: 0,
    }
    a.games++
    if (mp.acs != null) {
      a.acsSum += mp.acs
      a.acsN++
      const matchDate = matchIdToDate[mp.match_id]
      if (matchDate && isWithinDays(matchDate, 7)) {
        a.acsRecent.sum += mp.acs
        a.acsRecent.n++
      }
    }
    if (mp.k != null) a.kSum += mp.k
    if (mp.d != null) a.dSum += mp.d
    if (mp.plus_minus != null) {
      a.pmSum += mp.plus_minus
      a.pmN++
    }
    if (mp.fk != null) { a.fkSum += mp.fk; a.fkN++ }
    if (mp.fd != null) { a.fdSum += mp.fd; a.fdN++ }
    if (mp.plants != null) { a.plantsSum += mp.plants; a.plantsN++ }
    if (mp.defuses != null) { a.defusesSum += mp.defuses; a.defusesN++ }
    if (mp.clutches != null) { a.clutchesSum += mp.clutches; a.clutchesN++ }
    if (mp.econ != null) { a.econSum += mp.econ; a.econN++ }
    if (mp.adr != null) { a.adrSum += mp.adr; a.adrN++ }
    if (mp.hs != null && mp.bs != null && mp.ls != null) {
      a.hsSum += mp.hs; a.bsSum += mp.bs; a.lsSum += mp.ls; a.shotsN++
    }
    if (mp.ability_c != null) { a.cSum += mp.ability_c; a.cN++ }
    if (mp.ability_q != null) { a.qSum += mp.ability_q; a.qN++ }
    if (mp.ability_e != null) { a.eSum += mp.ability_e; a.eN++ }
    if (mp.ability_x != null) { a.xSum += mp.ability_x; a.xN++ }
    if (mp.rounds_afk != null) { a.afkSum += mp.rounds_afk; a.afkN++ }
    if (mp.friendly_fire_outgoing != null) { a.ffOutSum += mp.friendly_fire_outgoing; a.ffOutN++ }
    const rating = computeRating({ k: mp.k, a: null, d: mp.d }) // rating uses (k + 0.5a)/max(d,1); we don't have `a` here on the lite row, so substitute below
    // Actually compute rating using k/d only when a isn't on this row — fall back to k/max(d,1)
    if (mp.k != null && mp.d != null) {
      const r = mp.k / Math.max(mp.d, 1)
      a.ratingSum += r
      a.ratingN++
    } else if (rating != null) {
      a.ratingSum += rating
      a.ratingN++
    }
    const map = matchIdToMap[mp.match_id]
    if (map) {
      const pm = a.perMap[map] ?? { games: 0, wins: 0, acsSum: 0, acsN: 0 }
      pm.games++
      if (matchIdToResult[mp.match_id] === 'W') pm.wins++
      if (mp.acs != null) {
        pm.acsSum += mp.acs
        pm.acsN++
      }
      a.perMap[map] = pm
    }
    if (mp.agent) {
      a.agentCounts[mp.agent] = (a.agentCounts[mp.agent] ?? 0) + 1
    }
    agg[mp.player_id] = a
  }

  return Object.keys(agg).map((pid) => {
    const a = agg[pid]
    const avgAcs = a.acsN > 0 ? Math.round((a.acsSum / a.acsN) * 10) / 10 : null
    const avgKd =
      a.dSum > 0 ? Math.round((a.kSum / a.dSum) * 100) / 100 : a.kSum > 0 ? a.kSum : null
    const avgPlusMinus =
      a.pmN > 0 ? Math.round((a.pmSum / a.pmN) * 10) / 10 : null
    const avgRecent =
      a.acsRecent.n > 0 ? Math.round((a.acsRecent.sum / a.acsRecent.n) * 10) / 10 : null
    const acsDelta7d =
      avgRecent != null && avgAcs != null
        ? Math.round((avgRecent - avgAcs) * 10) / 10
        : null

    let bestMap: PlayerStat['bestMap'] = null
    for (const map of Object.keys(a.perMap)) {
      const pm = a.perMap[map]
      if (pm.games < 1) continue
      const winPct = (pm.wins / pm.games) * 100
      if (!bestMap || winPct > bestMap.winPct) {
        bestMap = { map, winPct: Math.round(winPct * 10) / 10, games: pm.games }
      }
    }

    let topAgent: PlayerStat['topAgent'] = null
    for (const ag of Object.keys(a.agentCounts)) {
      const c = a.agentCounts[ag]
      if (!topAgent || c > topAgent.count) topAgent = { agent: ag, count: c }
    }

    const perMapAcs = Object.keys(a.perMap)
      .map((m) => {
        const pm = a.perMap[m]
        return {
          map: m,
          games: pm.games,
          avgAcs: pm.acsN > 0 ? Math.round((pm.acsSum / pm.acsN) * 10) / 10 : null,
        }
      })
      .sort((x, y) => y.games - x.games)

    const avg = (sum: number, n: number, dp = 1) =>
      n > 0 ? Math.round((sum / n) * 10 ** dp) / 10 ** dp : null

    const totalShots = a.hsSum + a.bsSum + a.lsSum
    const hsPct = totalShots > 0 ? Math.round((a.hsSum / totalShots) * 1000) / 10 : null

    const avgC = avg(a.cSum, a.cN)
    const avgQ = avg(a.qSum, a.qN)
    const avgE = avg(a.eSum, a.eN)
    const avgX = avg(a.xSum, a.xN)
    const utilParts: number[] = []
    if (avgC != null) utilParts.push(avgC)
    if (avgQ != null) utilParts.push(avgQ)
    if (avgE != null) utilParts.push(avgE)
    if (avgX != null) utilParts.push(avgX)
    const avgUtilCasts =
      utilParts.length > 0
        ? Math.round(utilParts.reduce((s, v) => s + v, 0) * 10) / 10
        : null

    return {
      playerId: pid,
      name: a.name,
      games: a.games,
      avgAcs,
      avgKd,
      avgPlusMinus,
      bestMap,
      topAgent,
      acsDelta7d,
      perMapAcs,
      avgFk: avg(a.fkSum, a.fkN),
      avgFd: avg(a.fdSum, a.fdN),
      avgPlants: avg(a.plantsSum, a.plantsN),
      avgDefuses: avg(a.defusesSum, a.defusesN),
      avgClutches: avg(a.clutchesSum, a.clutchesN, 2),
      avgEcon: avg(a.econSum, a.econN, 0),
      avgRating: avg(a.ratingSum, a.ratingN, 2),
      avgAdr: avg(a.adrSum, a.adrN),
      hsPct,
      avgUtilCasts,
      avgC,
      avgQ,
      avgE,
      avgX,
      totalAfkRounds: a.afkN > 0 ? a.afkSum : null,
      totalFfOutgoing: a.ffOutN > 0 ? Math.round(a.ffOutSum * 10) / 10 : null,
    }
  })
}

// ── Opponents ───────────────────────────────────────────────────────────────

export type OppStat = {
  name: string
  played: number
  wins: number
  losses: number
  winPct: number | null
  lastMet: string | null // ISO date
  topMap: { map: string; count: number } | null
  topAgentStack: { agent: string; count: number }[] // top 5
  history: { matchIdHelldock: string; date: string; map: string | null; ourScore: number | null; oppScore: number | null; result: string | null }[]
}

type OppPlayerLite = {
  match_id: string
  agent: string | null
}

export function computeOppStats(
  matches: DashMatch[],
  oppPlayers: OppPlayerLite[]
): OppStat[] {
  // Map of opponent → all their matches (sorted desc)
  const byOpp: Record<string, DashMatch[]> = {}
  for (const m of matches) {
    if (!m.opponent_name) continue
    byOpp[m.opponent_name] = byOpp[m.opponent_name] ?? []
    byOpp[m.opponent_name].push(m)
  }

  // Build a match_id → opponent_name lookup so we can attribute opp_players → opp.
  const matchIdToOpp: Record<string, string | null> = {}
  for (const m of matches) matchIdToOpp[m.id] = m.opponent_name

  // Agent counts per opponent across opp_players
  const agentByOpp: Record<string, Record<string, number>> = {}
  for (const op of oppPlayers) {
    const opp = matchIdToOpp[op.match_id]
    if (!opp || !op.agent) continue
    agentByOpp[opp] = agentByOpp[opp] ?? {}
    agentByOpp[opp][op.agent] = (agentByOpp[opp][op.agent] ?? 0) + 1
  }

  return Object.keys(byOpp).map((name) => {
    const ms = byOpp[name]
    const sorted = [...ms].sort((a, b) => b.match_date.localeCompare(a.match_date))
    const wins = ms.filter((m) => m.result === 'W').length
    const losses = ms.filter((m) => m.result === 'L').length
    const decided = wins + losses

    // Top map they played against us
    const mapCounts: Record<string, number> = {}
    for (const m of ms) {
      if (!m.map_name) continue
      mapCounts[m.map_name] = (mapCounts[m.map_name] ?? 0) + 1
    }
    let topMap: OppStat['topMap'] = null
    for (const map of Object.keys(mapCounts)) {
      const c = mapCounts[map]
      if (!topMap || c > topMap.count) topMap = { map, count: c }
    }

    // Top 5 agents on their roster
    const agentEntries = Object.entries(agentByOpp[name] ?? {})
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      name,
      played: ms.length,
      wins,
      losses,
      winPct: pct(wins, decided),
      lastMet: sorted[0]?.match_date ?? null,
      topMap,
      topAgentStack: agentEntries,
      history: sorted.map((m) => ({
        matchIdHelldock: m.match_id_helldock,
        date: m.match_date,
        map: m.map_name,
        ourScore: m.our_score,
        oppScore: m.opp_score,
        result: m.result,
      })),
    }
  })
}

// ── Rounds ──────────────────────────────────────────────────────────────────

const ROUND_TYPES = ['Pistol', 'Eco', 'Anti-Eco', 'Bonus', 'Full Buy'] as const

export type RoundCell = { wins: number; total: number; winPct: number | null }

export type RoundStats = {
  matrix: Record<(typeof ROUND_TYPES)[number], { att: RoundCell; def: RoundCell }>
  firstBlood: { ourFb: RoundCell; theirFb: RoundCell }
  halves: { first: RoundCell; second: RoundCell; ot: RoundCell }
  pistol: { att: RoundCell; def: RoundCell; bonusAfterWin: RoundCell; bonusAfterLoss: RoundCell }
  sites: { a: RoundCell; b: RoundCell; c: RoundCell }
  combined: { antiEco: RoundCell; eco: RoundCell; bonus: RoundCell; fullBuy: RoundCell }
  // V4 additions — bomb timing in seconds (sample n indicates confidence)
  bombTiming: {
    avgPlantTime: number | null
    medianPlantTime: number | null
    plantSample: number
    avgDefuseTime: number | null
    medianDefuseTime: number | null
    defuseSample: number
  }
}

function cell(wins: number, total: number): RoundCell {
  return { wins, total, winPct: pct(wins, total) }
}

export function computeRoundStats(rounds: DashRound[]): RoundStats {
  // Matrix
  const matrix = {} as RoundStats['matrix']
  for (const rt of ROUND_TYPES) {
    matrix[rt] = { att: cell(0, 0), def: cell(0, 0) }
  }
  for (const r of rounds) {
    if (!r.round_type || !r.side || !r.outcome) continue
    if (!(ROUND_TYPES as readonly string[]).includes(r.round_type)) continue
    const m = matrix[r.round_type as (typeof ROUND_TYPES)[number]]
    const slot = r.side === 'Attack' ? m.att : r.side === 'Defense' ? m.def : null
    if (!slot) continue
    slot.total++
    if (r.outcome === 'W') slot.wins++
  }
  for (const rt of ROUND_TYPES) {
    matrix[rt].att.winPct = pct(matrix[rt].att.wins, matrix[rt].att.total)
    matrix[rt].def.winPct = pct(matrix[rt].def.wins, matrix[rt].def.total)
  }

  // First blood impact
  let ourFbW = 0,
    ourFbT = 0,
    theirFbW = 0,
    theirFbT = 0
  for (const r of rounds) {
    if (!r.first_blood || !r.outcome) continue
    if (r.first_blood === 'Us') {
      ourFbT++
      if (r.outcome === 'W') ourFbW++
    } else if (r.first_blood === 'Them') {
      theirFbT++
      if (r.outcome === 'W') theirFbW++
    }
  }

  // Halves
  let h1W = 0,
    h1T = 0,
    h2W = 0,
    h2T = 0,
    otW = 0,
    otT = 0
  for (const r of rounds) {
    if (!r.outcome) continue
    if (r.half === '1st') {
      h1T++
      if (r.outcome === 'W') h1W++
    } else if (r.half === '2nd') {
      h2T++
      if (r.outcome === 'W') h2W++
    } else if (r.half === 'OT') {
      otT++
      if (r.outcome === 'W') otW++
    }
  }

  // Pistol focus: pistol ATT/DEF + bonus-round (rounds 2–3 and 14–15) after pistol W vs L
  // Pistol rounds are round_num 1 and 13.
  // To compute carry-over, group rounds by match_id, find pistol outcome, then sum next two rounds.
  const byMatch: Record<string, DashRound[]> = {}
  for (const r of rounds) {
    byMatch[r.match_id] = byMatch[r.match_id] ?? []
    byMatch[r.match_id].push(r)
  }

  let pistolAttW = 0,
    pistolAttT = 0,
    pistolDefW = 0,
    pistolDefT = 0
  for (const r of rounds) {
    if (r.round_type !== 'Pistol' || !r.side || !r.outcome) continue
    if (r.side === 'Attack') {
      pistolAttT++
      if (r.outcome === 'W') pistolAttW++
    } else if (r.side === 'Defense') {
      pistolDefT++
      if (r.outcome === 'W') pistolDefW++
    }
  }

  let bonusAfterWinW = 0,
    bonusAfterWinT = 0,
    bonusAfterLossW = 0,
    bonusAfterLossT = 0
  for (const mid of Object.keys(byMatch)) {
    const rs = [...byMatch[mid]].sort((a, b) => a.round_num - b.round_num)
    const pistols = rs.filter((r) => r.round_num === 1 || r.round_num === 13)
    for (const p of pistols) {
      if (!p.outcome) continue
      const nextRounds = rs.filter(
        (r) => r.round_num > p.round_num && r.round_num <= p.round_num + 2
      )
      for (const nr of nextRounds) {
        if (!nr.outcome) continue
        if (p.outcome === 'W') {
          bonusAfterWinT++
          if (nr.outcome === 'W') bonusAfterWinW++
        } else if (p.outcome === 'L') {
          bonusAfterLossT++
          if (nr.outcome === 'W') bonusAfterLossW++
        }
      }
    }
  }

  // Site execute breakdown — ATT rounds where bomb was planted at a specific site
  let aW = 0, aT = 0, bW = 0, bT = 0, cW = 0, cT = 0
  for (const r of rounds) {
    if (!r.outcome || r.side !== 'Attack' || !r.site || r.site === 'N/A') continue
    if (r.site === 'A') { aT++; if (r.outcome === 'W') aW++ }
    else if (r.site === 'B') { bT++; if (r.outcome === 'W') bW++ }
    else if (r.site === 'C') { cT++; if (r.outcome === 'W') cW++ }
  }

  // Combined round-type (ATT+DEF together)
  const combined = { antiEco: cell(0, 0), eco: cell(0, 0), bonus: cell(0, 0), fullBuy: cell(0, 0) }
  for (const r of rounds) {
    if (!r.outcome || !r.round_type) continue
    if (r.round_type === 'Anti-Eco') { combined.antiEco.total++; if (r.outcome === 'W') combined.antiEco.wins++ }
    else if (r.round_type === 'Eco') { combined.eco.total++; if (r.outcome === 'W') combined.eco.wins++ }
    else if (r.round_type === 'Bonus') { combined.bonus.total++; if (r.outcome === 'W') combined.bonus.wins++ }
    else if (r.round_type === 'Full Buy') { combined.fullBuy.total++; if (r.outcome === 'W') combined.fullBuy.wins++ }
  }
  combined.antiEco.winPct = pct(combined.antiEco.wins, combined.antiEco.total)
  combined.eco.winPct = pct(combined.eco.wins, combined.eco.total)
  combined.bonus.winPct = pct(combined.bonus.wins, combined.bonus.total)
  combined.fullBuy.winPct = pct(combined.fullBuy.wins, combined.fullBuy.total)

  // Bomb timing — plant/defuse seconds
  const plantTimes: number[] = []
  const defuseTimes: number[] = []
  for (const r of rounds) {
    if (typeof r.plant_time_in_round === 'number' && r.plant_time_in_round > 0) {
      plantTimes.push(r.plant_time_in_round)
    }
    if (typeof r.defuse_time_in_round === 'number' && r.defuse_time_in_round > 0) {
      defuseTimes.push(r.defuse_time_in_round)
    }
  }
  function median(xs: number[]): number | null {
    if (xs.length === 0) return null
    const sorted = [...xs].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const m = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    return Math.round(m * 10) / 10
  }
  function mean(xs: number[]): number | null {
    if (xs.length === 0) return null
    return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10
  }

  return {
    matrix,
    firstBlood: {
      ourFb: cell(ourFbW, ourFbT),
      theirFb: cell(theirFbW, theirFbT),
    },
    halves: {
      first: cell(h1W, h1T),
      second: cell(h2W, h2T),
      ot: cell(otW, otT),
    },
    pistol: {
      att: cell(pistolAttW, pistolAttT),
      def: cell(pistolDefW, pistolDefT),
      bonusAfterWin: cell(bonusAfterWinW, bonusAfterWinT),
      bonusAfterLoss: cell(bonusAfterLossW, bonusAfterLossT),
    },
    sites: { a: cell(aW, aT), b: cell(bW, bT), c: cell(cW, cT) },
    combined,
    bombTiming: {
      avgPlantTime: mean(plantTimes),
      medianPlantTime: median(plantTimes),
      plantSample: plantTimes.length,
      avgDefuseTime: mean(defuseTimes),
      medianDefuseTime: median(defuseTimes),
      defuseSample: defuseTimes.length,
    },
  }
}

export { ROUND_TYPES }

// ── Coach Summary ───────────────────────────────────────────────────────────

export type CoachSummary = {
  last5: { wins: number; losses: number }
  last10: { wins: number; losses: number }
  thisWeek: number
  attPct: number | null
  defPct: number | null
  sideBias: 'ATT-leaning' | 'DEF-leaning' | 'Balanced' | null
  sideDelta: number | null // attPct - defPct
  worstMap: { map: string; winPct: number; games: number } | null
  bestMap: { map: string; winPct: number; games: number } | null
  worstSide: 'ATT' | 'DEF' | null
  worstRoundType: string | null
  topFragger: { name: string; avgAcs: number } | null
  bottomPlayer: { name: string; avgAcs: number } | null
  mostLoggedOpp: { name: string; count: number } | null
  // V4 additions
  afkFlag: { name: string; rounds: number } | null   // any player with >2 AFK rounds in last 7d
  ffFlag: { name: string; damage: number } | null    // any player with >100 outgoing FF damage in last 7d
}

export function computeCoachSummary(
  matches: DashMatch[],
  rounds: DashRound[],
  matchPlayers: FullMatchPlayer[]
): CoachSummary {
  const sorted = [...matches].sort((a, b) => b.match_date.localeCompare(a.match_date))
  const head = (n: number) => sorted.slice(0, n)

  function record(rows: DashMatch[]): { wins: number; losses: number } {
    let w = 0, l = 0
    for (const m of rows) {
      if (m.result === 'W') w++
      else if (m.result === 'L') l++
    }
    return { wins: w, losses: l }
  }

  // Side splits (global)
  let attW = 0, attT = 0, defW = 0, defT = 0
  for (const r of rounds) {
    if (!r.side || !r.outcome) continue
    if (r.side === 'Attack') { attT++; if (r.outcome === 'W') attW++ }
    else if (r.side === 'Defense') { defT++; if (r.outcome === 'W') defW++ }
  }
  const attPct = pct(attW, attT)
  const defPct = pct(defW, defT)
  let sideBias: CoachSummary['sideBias'] = null
  let sideDelta: number | null = null
  if (attPct != null && defPct != null) {
    sideDelta = Math.round((attPct - defPct) * 10) / 10
    if (sideDelta > 10) sideBias = 'ATT-leaning'
    else if (sideDelta < -10) sideBias = 'DEF-leaning'
    else sideBias = 'Balanced'
  }

  // Best/worst maps (≥2 played for ranking)
  const mw = mapWinStats(matches)
  let bestMap: CoachSummary['bestMap'] = null
  let worstMap: CoachSummary['worstMap'] = null
  for (const map of Object.keys(mw)) {
    const s = mw[map]
    if (s.total < 2) continue
    const winPct = Math.round((s.wins / s.total) * 1000) / 10
    if (!bestMap || winPct > bestMap.winPct) bestMap = { map, winPct, games: s.total }
    if (!worstMap || winPct < worstMap.winPct) worstMap = { map, winPct, games: s.total }
  }

  // Worst round type (combined ATT+DEF)
  const rtCounts: Record<string, { w: number; t: number }> = {}
  for (const r of rounds) {
    if (!r.round_type || !r.outcome) continue
    const cur = rtCounts[r.round_type] ?? { w: 0, t: 0 }
    cur.t++
    if (r.outcome === 'W') cur.w++
    rtCounts[r.round_type] = cur
  }
  let worstRoundType: string | null = null
  let worstRoundPct = Infinity
  for (const rt of Object.keys(rtCounts)) {
    const { w, t } = rtCounts[rt]
    if (t < 3) continue
    const p = (w / t) * 100
    if (p < worstRoundPct) {
      worstRoundPct = p
      worstRoundType = rt
    }
  }

  // Top + bottom fragger (≥1 game)
  const playerStats = computePlayerStats(matches, matchPlayers)
  const withAcs = playerStats.filter((p) => p.avgAcs != null) as Array<PlayerStat & { avgAcs: number }>
  let topFragger: CoachSummary['topFragger'] = null
  let bottomPlayer: CoachSummary['bottomPlayer'] = null
  for (const p of withAcs) {
    if (!topFragger || p.avgAcs > topFragger.avgAcs) topFragger = { name: p.name, avgAcs: p.avgAcs }
    if (!bottomPlayer || p.avgAcs < bottomPlayer.avgAcs) bottomPlayer = { name: p.name, avgAcs: p.avgAcs }
  }

  // Most logged opp
  const oppCounts: Record<string, number> = {}
  for (const m of matches) {
    if (!m.opponent_name) continue
    oppCounts[m.opponent_name] = (oppCounts[m.opponent_name] ?? 0) + 1
  }
  let mostLoggedOpp: CoachSummary['mostLoggedOpp'] = null
  for (const opp of Object.keys(oppCounts)) {
    const c = oppCounts[opp]
    if (!mostLoggedOpp || c > mostLoggedOpp.count) mostLoggedOpp = { name: opp, count: c }
  }

  const thisWeek = matches.filter((m) => isWithinDays(m.match_date, 7)).length

  // AFK + FF flags — scan last-7d match-players for any threshold breach
  const recentMatchIds: Record<string, true> = {}
  for (const m of matches) {
    if (isWithinDays(m.match_date, 7)) recentMatchIds[m.id] = true
  }
  let afkFlag: CoachSummary['afkFlag'] = null
  let ffFlag: CoachSummary['ffFlag'] = null
  for (const mp of matchPlayers) {
    if (!recentMatchIds[mp.match_id] || !mp.player) continue
    if (mp.rounds_afk != null && mp.rounds_afk > 2) {
      if (!afkFlag || mp.rounds_afk > afkFlag.rounds) {
        afkFlag = { name: mp.player.display_name, rounds: mp.rounds_afk }
      }
    }
    if (mp.friendly_fire_outgoing != null && mp.friendly_fire_outgoing > 100) {
      if (!ffFlag || mp.friendly_fire_outgoing > ffFlag.damage) {
        ffFlag = { name: mp.player.display_name, damage: mp.friendly_fire_outgoing }
      }
    }
  }

  return {
    last5: record(head(5)),
    last10: record(head(10)),
    thisWeek,
    attPct,
    defPct,
    sideBias,
    sideDelta,
    bestMap,
    worstMap,
    worstSide: attPct != null && defPct != null ? (attPct < defPct ? 'ATT' : 'DEF') : null,
    worstRoundType,
    topFragger,
    bottomPlayer,
    mostLoggedOpp,
    afkFlag,
    ffFlag,
  }
}

// ── Comp Lab ────────────────────────────────────────────────────────────────

export type CompEntry = {
  agents: string[]
  archetype: Archetype
  played: number
  wins: number
  losses: number
  winPct: number | null
  avgScoreDiff: number | null
  lastPlayed: string | null
}

export type CompLabResult = {
  winners: CompEntry[]
  experimental: CompEntry[]
  losers: CompEntry[]
}

export function computeCompLab(matches: DashMatch[], mapName: string): CompLabResult {
  const onMap = matches.filter((m) => m.map_name === mapName)
  const byComp: Record<string, {
    agents: string[]
    wins: number
    losses: number
    total: number
    diffSum: number
    diffN: number
    lastPlayed: string | null
  }> = {}

  for (const m of onMap) {
    if (!m.our_agents || m.our_agents.length === 0) continue
    const sorted = [...m.our_agents].sort()
    const key = sorted.join(',')
    const cur = byComp[key] ?? { agents: sorted, wins: 0, losses: 0, total: 0, diffSum: 0, diffN: 0, lastPlayed: null }
    cur.total++
    if (m.result === 'W') cur.wins++
    else if (m.result === 'L') cur.losses++
    if (m.our_score != null && m.opp_score != null) {
      cur.diffSum += (m.our_score - m.opp_score)
      cur.diffN++
    }
    if (!cur.lastPlayed || m.match_date > cur.lastPlayed) cur.lastPlayed = m.match_date
    byComp[key] = cur
  }

  const entries: CompEntry[] = Object.values(byComp).map((c) => ({
    agents: c.agents,
    archetype: classifyArchetype(c.agents),
    played: c.total,
    wins: c.wins,
    losses: c.losses,
    winPct: pct(c.wins, c.total),
    avgScoreDiff: c.diffN > 0 ? Math.round((c.diffSum / c.diffN) * 10) / 10 : null,
    lastPlayed: c.lastPlayed,
  }))

  const winners: CompEntry[] = []
  const experimental: CompEntry[] = []
  const losers: CompEntry[] = []

  for (const e of entries) {
    if (e.played <= 2) experimental.push(e)
    else if (e.winPct != null && e.winPct >= 60) winners.push(e)
    else if (e.winPct != null && e.winPct < 40) losers.push(e)
    else experimental.push(e) // 40–60% on 3+ — call it experimental for now
  }

  const byWinPctDesc = (a: CompEntry, b: CompEntry) => (b.winPct ?? 0) - (a.winPct ?? 0) || b.played - a.played
  winners.sort(byWinPctDesc)
  experimental.sort((a, b) => b.played - a.played || (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''))
  losers.sort(byWinPctDesc)

  return { winners, experimental, losers }
}

// ── Map Pool Health ─────────────────────────────────────────────────────────

export type MapPoolEntry = {
  map: ValMap
  played: number
  wins: number
  losses: number
  winPct: number | null
  tier: MapTier
  recommendation: 'Pick' | 'Decider' | 'Ban' | 'Develop'
}

export function computeMapPoolHealth(matches: DashMatch[]): MapPoolEntry[] {
  const mw = mapWinStats(matches)
  return MAPS.map((map) => {
    const s = mw[map] ?? { wins: 0, total: 0 }
    const tier = classifyMapTier(s)
    return {
      map,
      played: s.total,
      wins: s.wins,
      losses: s.total - s.wins,
      winPct: pct(s.wins, s.total),
      tier,
      recommendation: tierRecommendation(tier),
    }
  }).sort((a, b) => {
    const order: Record<MapTier, number> = { S: 0, A: 1, B: 2, C: 3, DEV: 4 }
    if (order[a.tier] !== order[b.tier]) return order[a.tier] - order[b.tier]
    return (b.winPct ?? -1) - (a.winPct ?? -1)
  })
}
