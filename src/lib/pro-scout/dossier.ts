/**
 * Pro-scout dossier computation.
 *
 * Loads a team's matches/maps/players/rounds from Supabase, then aggregates
 * everything in memory (simpler than dense SQL, fast enough for ~150 matches).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { roleForAgent, type AgentRole } from './agent-roles'
import type {
  ProTeamDossier,
  ProTeamSummary,
  ProDossierForm,
  ProDossierMapStat,
  ProDossierPlayer,
  ProDossierComp,
  ProTacticalPatterns,
  ProDossierMatch,
  ProDossierRoleBaseline,
} from './types'

type MatchRow = {
  id: string
  vlr_match_id: number
  event_id: string | null
  event_stage: string | null
  team_a_id: string
  team_b_id: string
  team_a_score: number | null
  team_b_score: number | null
  winner_team_id: string | null
  format: string | null
  match_date: string | null
  url: string | null
}

type MapRow = {
  id: string
  match_id: string
  map_order: number
  map_name: string
  pick_team_id: string | null
  team_a_score: number | null
  team_b_score: number | null
  team_a_atk_score: number | null
  team_a_def_score: number | null
  team_b_atk_score: number | null
  team_b_def_score: number | null
  team_a_start_side: string | null
  winner_team_id: string | null
}

type PpmsRow = {
  map_result_id: string
  player_id: string | null
  team_id: string
  ign: string
  agent: string | null
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
  plus_minus: number | null
  fk: number | null
  fd: number | null
}

type RoundRow = {
  map_result_id: string
  round_num: number
  half: string | null
  winner_team_id: string | null
  end_type: string | null
  plant_happened: boolean | null
  team_a_side: string | null
  team_b_side: string | null
}

export async function computeTeamDossier(
  sb: SupabaseClient,
  teamId: string,
  opts?: { eventIds?: string[]; limitMatches?: number }
): Promise<ProTeamDossier | null> {
  // ── Team meta ──
  const { data: team } = await sb
    .from('pro_teams')
    .select('id, vlr_team_id, name, tag, region, url, logo_url')
    .eq('id', teamId)
    .single()
  if (!team) return null

  const teamSummary: ProTeamSummary = {
    id: team.id,
    vlrTeamId: team.vlr_team_id,
    name: team.name,
    tag: team.tag,
    region: team.region,
    url: team.url,
    logoUrl: team.logo_url,
  }

  // ── Matches ──
  let mq = sb
    .from('pro_matches')
    .select(
      'id, vlr_match_id, event_id, event_stage, team_a_id, team_b_id, team_a_score, team_b_score, winner_team_id, format, match_date, url'
    )
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order('match_date', { ascending: false })
  if (opts?.eventIds?.length) mq = mq.in('event_id', opts.eventIds)
  if (opts?.limitMatches) mq = mq.limit(opts.limitMatches)

  const { data: matches } = await mq
  const matchRows = (matches ?? []) as MatchRow[]
  if (matchRows.length === 0) {
    return {
      team: teamSummary,
      scope: { label: 'no matches', eventNames: [], matchCount: 0 },
      form: emptyForm(),
      maps: [],
      roster: [],
      topComps: [],
      tactics: emptyTactics(),
      recentMatches: [],
      roleBaselines: [],
    }
  }
  const matchIds = matchRows.map((m) => m.id)

  // ── Maps + Teams + Events + League baseline (parallel) ──
  const [mapsRes, oppNamesRes, eventNamesRes, baselineRes] = await Promise.all([
    sb
      .from('pro_map_results')
      .select(
        'id, match_id, map_order, map_name, pick_team_id, team_a_score, team_b_score, team_a_atk_score, team_a_def_score, team_b_atk_score, team_b_def_score, team_a_start_side, winner_team_id'
      )
      .in('match_id', matchIds),
    sb
      .from('pro_teams')
      .select('id, name')
      .in(
        'id',
        Array.from(new Set(matchRows.flatMap((m) => [m.team_a_id, m.team_b_id])))
      ),
    sb
      .from('pro_events')
      .select('id, name')
      .in(
        'id',
        Array.from(
          new Set(matchRows.map((m) => m.event_id).filter((x): x is string => !!x))
        )
      ),
    sb
      .from('pro_player_map_stats')
      .select('agent, acs')
      .not('acs', 'is', null)
      .limit(5000),
  ])
  const mapRows = (mapsRes.data ?? []) as MapRow[]
  const mapIds = mapRows.map((m) => m.id)

  // ── Players + Rounds (depend on mapIds) ──
  const [ppms2, rounds2] = await Promise.all([
    sb
      .from('pro_player_map_stats')
      .select(
        'map_result_id, player_id, team_id, ign, agent, acs, k, d, a, plus_minus, fk, fd'
      )
      .in('map_result_id', mapIds),
    sb
      .from('pro_rounds')
      .select(
        'map_result_id, round_num, half, winner_team_id, end_type, plant_happened, team_a_side, team_b_side'
      )
      .in('map_result_id', mapIds),
  ])
  const ppmsRows = (ppms2.data ?? []) as PpmsRow[]
  const roundRows = (rounds2.data ?? []) as RoundRow[]

  const teamNameById = new Map(
    (oppNamesRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])
  )
  const eventNameById = new Map(
    (eventNamesRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])
  )

  // ── Group helpers ──
  const mapsByMatch = new Map<string, MapRow[]>()
  for (const m of mapRows) {
    if (!mapsByMatch.has(m.match_id)) mapsByMatch.set(m.match_id, [])
    mapsByMatch.get(m.match_id)!.push(m)
  }
  for (const arr of mapsByMatch.values()) arr.sort((a, b) => a.map_order - b.map_order)

  const ppmsByMap = new Map<string, PpmsRow[]>()
  for (const p of ppmsRows) {
    if (!ppmsByMap.has(p.map_result_id)) ppmsByMap.set(p.map_result_id, [])
    ppmsByMap.get(p.map_result_id)!.push(p)
  }
  const roundsByMap = new Map<string, RoundRow[]>()
  for (const r of roundRows) {
    if (!roundsByMap.has(r.map_result_id)) roundsByMap.set(r.map_result_id, [])
    roundsByMap.get(r.map_result_id)!.push(r)
  }

  // ── Form ──
  const form = computeForm(matchRows, mapRows, teamId)

  // ── Maps ──
  const mapStats = computeMapStats(matchRows, mapsByMatch, ppmsByMap, teamId)

  // ── Roster ──
  const roster = computeRoster(mapRows, ppmsRows, teamId)

  // ── Top comps ──
  const topComps = computeTopComps(mapRows, ppmsRows, teamId)

  // ── Tactical patterns ──
  const tactics = computeTactics(matchRows, mapRows, roundsByMap, ppmsRows, teamId)

  // ── Recent matches ──
  const recentMatches: ProDossierMatch[] = matchRows.slice(0, 15).map((m) => {
    const oppId = m.team_a_id === teamId ? m.team_b_id : m.team_a_id
    const isA = m.team_a_id === teamId
    const teamScore = (isA ? m.team_a_score : m.team_b_score) ?? 0
    const oppScore = (isA ? m.team_b_score : m.team_a_score) ?? 0
    const result: 'W' | 'L' | 'T' =
      m.winner_team_id === teamId ? 'W' : m.winner_team_id == null ? 'T' : 'L'

    const matchMaps = (mapsByMatch.get(m.id) ?? []).map((mr) => ({
      mapName: mr.map_name,
      teamScore: (isA ? mr.team_a_score : mr.team_b_score) ?? 0,
      oppScore: (isA ? mr.team_b_score : mr.team_a_score) ?? 0,
    }))

    return {
      matchId: m.id,
      vlrMatchId: m.vlr_match_id,
      url: m.url,
      date: m.match_date,
      opponentName: teamNameById.get(oppId) ?? '—',
      opponentTeamId: oppId,
      result,
      teamScore,
      oppScore,
      eventName: m.event_id ? eventNameById.get(m.event_id) ?? null : null,
      eventStage: m.event_stage,
      maps: matchMaps,
    }
  })

  // ── Role baselines (entire league, not just this team) ──
  const baselineRaw = (baselineRes.data ?? []) as { agent: string | null; acs: number | null }[]
  const roleBaselines = computeRoleBaselines(baselineRaw)

  // ── Scope label ──
  const eventNames = Array.from(
    new Set(matchRows.map((m) => (m.event_id ? eventNameById.get(m.event_id) : null)).filter(Boolean))
  ) as string[]
  const scope = {
    label: eventNames.length === 1 ? eventNames[0] : `${eventNames.length} events`,
    eventNames,
    matchCount: matchRows.length,
  }

  return {
    team: teamSummary,
    scope,
    form,
    maps: mapStats,
    roster,
    topComps,
    tactics,
    recentMatches,
    roleBaselines,
  }
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function computeForm(matches: MatchRow[], mapRows: MapRow[], teamId: string): ProDossierForm {
  let seriesW = 0
  let seriesL = 0
  let mapW = 0
  let mapL = 0
  for (const m of matches) {
    if (m.winner_team_id === teamId) seriesW++
    else if (m.winner_team_id && m.winner_team_id !== teamId) seriesL++
  }
  for (const mr of mapRows) {
    if (mr.winner_team_id === teamId) mapW++
    else if (mr.winner_team_id && mr.winner_team_id !== teamId) mapL++
  }
  const recentSeries = matches
    .slice(0, 5)
    .map((m) => (m.winner_team_id === teamId ? 'W' : 'L'))
    .join('-')

  // Trend: split matches in half, compare map-win % halves
  let trendDelta: number | null = null
  if (matches.length >= 4) {
    const half = Math.floor(matches.length / 2)
    const recent = matches.slice(0, half)
    const older = matches.slice(half)
    const mapWinPct = (slice: MatchRow[]) => {
      const sliceIds = new Set(slice.map((m) => m.id))
      const sliceMaps = mapRows.filter((mr) => sliceIds.has(mr.match_id))
      const w = sliceMaps.filter((mr) => mr.winner_team_id === teamId).length
      const total = sliceMaps.length
      return total ? (w / total) * 100 : null
    }
    const r = mapWinPct(recent)
    const o = mapWinPct(older)
    if (r != null && o != null) trendDelta = Math.round((r - o) * 10) / 10
  }

  return {
    played: matches.length,
    mapWins: mapW,
    mapLosses: mapL,
    mapWinPct: mapW + mapL ? Math.round((mapW / (mapW + mapL)) * 100) : null,
    seriesWins: seriesW,
    seriesLosses: seriesL,
    seriesWinPct: seriesW + seriesL ? Math.round((seriesW / (seriesW + seriesL)) * 100) : null,
    recentForm: recentSeries,
    trendDelta,
    lastPlayed: matches[0]?.match_date ?? null,
  }
}

function emptyForm(): ProDossierForm {
  return {
    played: 0,
    mapWins: 0,
    mapLosses: 0,
    mapWinPct: null,
    seriesWins: 0,
    seriesLosses: 0,
    seriesWinPct: null,
    recentForm: '',
    trendDelta: null,
    lastPlayed: null,
  }
}

// ─── Maps ─────────────────────────────────────────────────────────────────────

function computeMapStats(
  matches: MatchRow[],
  mapsByMatch: Map<string, MapRow[]>,
  ppmsByMap: Map<string, PpmsRow[]>,
  teamId: string
): ProDossierMapStat[] {
  // Collect this team's maps
  type Acc = {
    played: number
    wins: number
    picked: number
    pickedByOpp: number
    decider: number
    atkRounds: number
    defRounds: number
    atkWins: number
    defWins: number
    agentCounts: Map<string, number>
  }
  const byMap = new Map<string, Acc>()
  for (const match of matches) {
    const isA = match.team_a_id === teamId
    const oppId = isA ? match.team_b_id : match.team_a_id
    const matchMaps = mapsByMatch.get(match.id) ?? []
    for (const mr of matchMaps) {
      const acc =
        byMap.get(mr.map_name) ??
        ({
          played: 0,
          wins: 0,
          picked: 0,
          pickedByOpp: 0,
          decider: 0,
          atkRounds: 0,
          defRounds: 0,
          atkWins: 0,
          defWins: 0,
          agentCounts: new Map<string, number>(),
        } as Acc)
      byMap.set(mr.map_name, acc)
      acc.played++
      if (mr.winner_team_id === teamId) acc.wins++
      if (mr.pick_team_id === teamId) acc.picked++
      else if (mr.pick_team_id === oppId) acc.pickedByOpp++
      else acc.decider++

      // Side splits — atk/def rounds for THIS team
      const teamAAtk = mr.team_a_atk_score ?? 0
      const teamADef = mr.team_a_def_score ?? 0
      const teamBAtk = mr.team_b_atk_score ?? 0
      const teamBDef = mr.team_b_def_score ?? 0
      const oppAtk = isA ? teamBAtk : teamAAtk
      const oppDef = isA ? teamBDef : teamADef
      const ourAtk = isA ? teamAAtk : teamBAtk
      const ourDef = isA ? teamADef : teamBDef
      acc.atkWins += ourAtk
      acc.defWins += ourDef
      acc.atkRounds += ourAtk + oppDef
      acc.defRounds += ourDef + oppAtk

      // Top agents — team's 5 players' agents on this map
      const ppms = (ppmsByMap.get(mr.id) ?? []).filter((p) => p.team_id === teamId)
      for (const p of ppms) {
        if (!p.agent) continue
        acc.agentCounts.set(p.agent, (acc.agentCounts.get(p.agent) ?? 0) + 1)
      }
    }
  }

  return Array.from(byMap.entries())
    .map(([mapName, acc]) => {
      const topAgents = Array.from(acc.agentCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([agent, count]) => ({ agent, count }))
      return {
        mapName,
        played: acc.played,
        wins: acc.wins,
        winPct: acc.played ? Math.round((acc.wins / acc.played) * 100) : null,
        picked: acc.picked,
        pickedByOpp: acc.pickedByOpp,
        decider: acc.decider,
        atkWinPct: acc.atkRounds
          ? Math.round((acc.atkWins / acc.atkRounds) * 100)
          : null,
        defWinPct: acc.defRounds
          ? Math.round((acc.defWins / acc.defRounds) * 100)
          : null,
        topAgents,
      }
    })
    .sort((a, b) => b.played - a.played)
}

// ─── Roster ───────────────────────────────────────────────────────────────────

function computeRoster(
  mapRows: MapRow[],
  ppmsRows: PpmsRow[],
  teamId: string
): ProDossierPlayer[] {
  const mine = ppmsRows.filter((p) => p.team_id === teamId)

  type Acc = {
    ign: string
    country: string | null
    agents: Map<string, number>
    sumAcs: number; nAcs: number
    sumK: number;   nK: number
    sumD: number;   nD: number
    sumA: number;   nA: number
    sumPm: number;  nPm: number
    mapsTotal: number  // total maps this player appeared on (incl. null-stat rows)
    mapsWithStats: number  // maps where at least one stat is non-null
  }
  const byPlayer = new Map<string, Acc>()
  for (const p of mine) {
    const key = p.player_id ?? p.ign
    const acc =
      byPlayer.get(key) ??
      ({
        ign: p.ign,
        country: null,
        agents: new Map<string, number>(),
        sumAcs: 0, nAcs: 0,
        sumK: 0,   nK: 0,
        sumD: 0,   nD: 0,
        sumA: 0,   nA: 0,
        sumPm: 0,  nPm: 0,
        mapsTotal: 0,
        mapsWithStats: 0,
      } as Acc)
    byPlayer.set(key, acc)
    if (p.agent) acc.agents.set(p.agent, (acc.agents.get(p.agent) ?? 0) + 1)
    if (p.acs != null) { acc.sumAcs += p.acs; acc.nAcs++ }
    if (p.k != null)   { acc.sumK += p.k;     acc.nK++ }
    if (p.d != null)   { acc.sumD += p.d;     acc.nD++ }
    if (p.a != null)   { acc.sumA += p.a;     acc.nA++ }
    if (p.plus_minus != null) { acc.sumPm += p.plus_minus; acc.nPm++ }
    acc.mapsTotal++
    if (p.acs != null || p.k != null || p.agent != null) acc.mapsWithStats++
  }

  const avg = (sum: number, n: number) =>
    n > 0 ? Math.round((sum / n) * 10) / 10 : null

  return Array.from(byPlayer.entries())
    // Drop ghost rows (player appeared but every stat is null — VLR didn't expose data)
    .filter(([, acc]) => acc.mapsWithStats > 0)
    .map(([key, acc]) => {
      const topAgents = Array.from(acc.agents.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([agent, count]) => ({ agent, count }))
      const sig = topAgents[0] ?? null
      const roleCounts = new Map<AgentRole, number>()
      for (const [agent, count] of acc.agents) {
        const role = roleForAgent(agent)
        if (role) roleCounts.set(role, (roleCounts.get(role) ?? 0) + count)
      }
      let primaryRole: AgentRole | null = null
      let maxN = 0
      for (const [role, n] of roleCounts) {
        if (n > maxN) {
          primaryRole = role
          maxN = n
        }
      }

      return {
        playerId: key,
        ign: acc.ign,
        country: acc.country,
        primaryRole,
        agentsCount: acc.agents.size,
        signatureAgent: sig
          ? { agent: sig.agent, role: roleForAgent(sig.agent), count: sig.count }
          : null,
        avgAcs: avg(acc.sumAcs, acc.nAcs),
        avgK: avg(acc.sumK, acc.nK),
        avgD: avg(acc.sumD, acc.nD),
        avgA: avg(acc.sumA, acc.nA),
        avgPlusMinus: avg(acc.sumPm, acc.nPm),
        maps: acc.mapsWithStats,
        topAgents,
      }
    })
    .sort((a, b) => (b.avgAcs ?? 0) - (a.avgAcs ?? 0))
}

// ─── Comps ────────────────────────────────────────────────────────────────────

function computeTopComps(
  mapRows: MapRow[],
  ppmsRows: PpmsRow[],
  teamId: string
): ProDossierComp[] {
  const byMap = new Map<string, PpmsRow[]>()
  for (const p of ppmsRows.filter((x) => x.team_id === teamId)) {
    if (!byMap.has(p.map_result_id)) byMap.set(p.map_result_id, [])
    byMap.get(p.map_result_id)!.push(p)
  }
  const mapById = new Map(mapRows.map((m) => [m.id, m]))

  type CompAcc = { played: number; wins: number; maps: Set<string> }
  const byComp = new Map<string, { agents: string[]; acc: CompAcc }>()
  for (const [mapResultId, ppms] of byMap) {
    const mr = mapById.get(mapResultId)
    if (!mr) continue
    const agents = ppms
      .map((p) => p.agent)
      .filter((a): a is string => !!a)
      .sort()
    if (agents.length < 5) continue
    const key = agents.join(',')
    const entry =
      byComp.get(key) ??
      { agents, acc: { played: 0, wins: 0, maps: new Set<string>() } }
    byComp.set(key, entry)
    entry.acc.played++
    if (mr.winner_team_id === teamId) entry.acc.wins++
    entry.acc.maps.add(mr.map_name)
  }

  return Array.from(byComp.values())
    .map(({ agents, acc }) => {
      const roles = agents.map((a) => roleForAgent(a))
      const counts = roles.reduce<Record<string, number>>((r, role) => {
        const k = role ?? 'Unknown'
        r[k] = (r[k] ?? 0) + 1
        return r
      }, {})
      const archetypeBits: string[] = []
      if (counts.Duelist > 1) archetypeBits.push('Double-Duelist')
      if (counts.Initiator > 1) archetypeBits.push('Double-Init')
      if (counts.Controller > 1) archetypeBits.push('Double-Controller')
      if (counts.Sentinel > 1) archetypeBits.push('Double-Sentinel')
      const archetype = archetypeBits.length ? archetypeBits.join(' ') : 'Standard'

      return {
        agents,
        archetype,
        played: acc.played,
        wins: acc.wins,
        winPct: acc.played ? Math.round((acc.wins / acc.played) * 100) : null,
        maps: Array.from(acc.maps),
      }
    })
    .sort((a, b) => b.played - a.played)
    .slice(0, 10)
}

// ─── Tactics ──────────────────────────────────────────────────────────────────

function computeTactics(
  matches: MatchRow[],
  mapRows: MapRow[],
  roundsByMap: Map<string, RoundRow[]>,
  ppmsRows: PpmsRow[],
  teamId: string
): ProTacticalPatterns {
  let pistolPlayed = 0
  let pistolWins = 0
  let bonusPlayed = 0
  let bonusWins = 0
  let plantAtkN = 0
  let plantAtkPlants = 0
  let closeoutN = 0
  let closeoutW = 0
  let comebackN = 0
  let comebackW = 0
  let otPlayed = 0
  let otWins = 0

  const teamAByMatchId = new Map(matches.map((m) => [m.id, m.team_a_id === teamId]))

  for (const mr of mapRows) {
    const isA = teamAByMatchId.get(mr.match_id) ?? false
    const rounds = roundsByMap.get(mr.id) ?? []

    // Half-time score (rounds 1-12) — to compute closeout vs comeback
    const firstHalf = rounds.filter((r) => r.round_num <= 12)
    const firstHalfOurWins = firstHalf.filter((r) =>
      r.winner_team_id === teamId
    ).length
    const firstHalfOppWins = firstHalf.length - firstHalfOurWins
    const won = mr.winner_team_id === teamId
    if (firstHalfOurWins > firstHalfOppWins) {
      closeoutN++
      if (won) closeoutW++
    } else if (firstHalfOurWins < firstHalfOppWins) {
      comebackN++
      if (won) comebackW++
    }

    // OT
    const ot = rounds.filter((r) => r.round_num > 24)
    if (ot.length > 0) {
      otPlayed++
      if (won) otWins++
    }

    for (const r of rounds) {
      // Pistols: rounds 1 + 13
      if (r.round_num === 1 || r.round_num === 13) {
        pistolPlayed++
        if (r.winner_team_id === teamId) pistolWins++
      }
      // Bonus rounds: 2 + 14 (carry rounds)
      if (r.round_num === 2 || r.round_num === 14) {
        bonusPlayed++
        if (r.winner_team_id === teamId) bonusWins++
      }
      // Plant rate while attacking
      const ourSide = isA ? r.team_a_side : r.team_b_side
      if (ourSide === 'Attack') {
        plantAtkN++
        if (r.plant_happened === true) plantAtkPlants++
      }
    }
  }

  // FK/FD diff (sample if any populated)
  const fkSum = ppmsRows
    .filter((p) => p.team_id === teamId && p.fk != null)
    .reduce((s, p) => s + (p.fk ?? 0), 0)
  const fdSum = ppmsRows
    .filter((p) => p.team_id === teamId && p.fd != null)
    .reduce((s, p) => s + (p.fd ?? 0), 0)
  const fkFdDiff = fkSum + fdSum > 0 ? fkSum - fdSum : null

  return {
    pistolPlayed,
    pistolWins,
    pistolWinPct: pistolPlayed ? Math.round((pistolWins / pistolPlayed) * 100) : null,
    bonusRoundPlayed: bonusPlayed,
    bonusRoundWins: bonusWins,
    bonusRoundWinPct: bonusPlayed ? Math.round((bonusWins / bonusPlayed) * 100) : null,
    plantRateAtk: plantAtkN ? Math.round((plantAtkPlants / plantAtkN) * 100) : null,
    plantAtkN,
    closeoutRate: closeoutN ? Math.round((closeoutW / closeoutN) * 100) : null,
    comebackRate: comebackN ? Math.round((comebackW / comebackN) * 100) : null,
    otPlayed,
    otWins,
    fkFdDiff,
  }
}

function emptyTactics(): ProTacticalPatterns {
  return {
    pistolPlayed: 0,
    pistolWins: 0,
    pistolWinPct: null,
    bonusRoundPlayed: 0,
    bonusRoundWins: 0,
    bonusRoundWinPct: null,
    plantRateAtk: null,
    plantAtkN: 0,
    closeoutRate: null,
    comebackRate: null,
    otPlayed: 0,
    otWins: 0,
    fkFdDiff: null,
  }
}

// ─── Role baselines ───────────────────────────────────────────────────────────

function computeRoleBaselines(
  rows: { agent: string | null; acs: number | null }[]
): ProDossierRoleBaseline[] {
  const byRole = new Map<AgentRole, number[]>()
  for (const r of rows) {
    if (r.acs == null || !r.agent) continue
    const role = roleForAgent(r.agent)
    if (!role) continue
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role)!.push(r.acs)
  }
  const out: ProDossierRoleBaseline[] = []
  for (const [role, vals] of byRole) {
    if (!vals.length) continue
    vals.sort((a, b) => a - b)
    const q = (p: number) => vals[Math.floor((vals.length - 1) * p)]
    out.push({
      role,
      n: vals.length,
      acsP25: q(0.25),
      acsP50: q(0.5),
      acsP75: q(0.75),
    })
  }
  return out
}
