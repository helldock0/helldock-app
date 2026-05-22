/**
 * Pro player dossier computation.
 *
 * Aggregates a single pro player across every map they've played, computes
 * percentile ranks vs role peers, finds similar players via cosine similarity,
 * and pivots their performance into an agent×map grid + peer scatter cloud.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { roleForAgent, type AgentRole } from './agent-roles'
import type {
  AgentMapCell,
  PercentileCategory,
  PercentileSlice,
  PeerScatterPoint,
  ProPlayerCareer,
  ProPlayerDossier,
  ProPlayerSummary,
  RecentFormEntry,
  SimilarPlayer,
} from './types'

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

type MapRow = {
  id: string
  match_id: string
  map_name: string
  winner_team_id: string | null
}

type MatchRow = {
  id: string
  team_a_id: string
  team_b_id: string
  winner_team_id: string | null
  match_date: string | null
  url: string | null
}

type TeamRow = {
  id: string
  name: string
  tag: string | null
  slug: string | null
}

type PlayerRow = {
  id: string
  ign: string
  country: string | null
  real_name: string | null
  current_team_id: string | null
}

// ─── Stat keys ────────────────────────────────────────────────────────────────

type StatKey =
  | 'acs'
  | 'kPerMap'
  | 'kdRatio'
  | 'plusMinus'
  | 'aPerMap'
  | 'fkPerMap'
  | 'kaPerMap'
  | 'survivalRate'
  | 'fkFdDiff'
  | 'consistency'

const STAT_DEFS: Record<
  StatKey,
  { label: string; category: PercentileCategory; higherBetter: boolean }
> = {
  acs:          { label: 'ACS',           category: 'firepower',   higherBetter: true  },
  kPerMap:      { label: 'K / map',       category: 'firepower',   higherBetter: true  },
  kdRatio:      { label: 'K / D',         category: 'firepower',   higherBetter: true  },
  plusMinus:    { label: '+/- per map',   category: 'impact',      higherBetter: true  },
  aPerMap:      { label: 'A / map',       category: 'impact',      higherBetter: true  },
  fkPerMap:     { label: 'FK / map',      category: 'impact',      higherBetter: true  },
  kaPerMap:     { label: 'K+A / map',     category: 'survival',    higherBetter: true  },
  survivalRate: { label: 'Survival %',    category: 'survival',    higherBetter: true  },
  fkFdDiff:     { label: 'FK − FD',       category: 'consistency', higherBetter: true  },
  consistency:  { label: 'ACS consist.',  category: 'consistency', higherBetter: true  },
}

const STAT_ORDER: StatKey[] = [
  'acs', 'kPerMap', 'kdRatio',
  'plusMinus', 'aPerMap', 'fkPerMap',
  'kaPerMap', 'survivalRate',
  'fkFdDiff', 'consistency',
]

type PlayerAggregate = {
  ign: string
  teamId: string | null
  agents: Map<string, number>
  primaryRole: AgentRole | null
  signatureAgent: string | null
  maps: number             // maps with at least ACS or K
  acsValues: number[]
  sumAcs: number; nAcs: number
  sumK: number;   nK: number
  sumD: number;   nD: number
  sumA: number;   nA: number
  sumPm: number;  nPm: number
  sumFk: number;  nFk: number
  sumFd: number;  nFd: number
  stats: Partial<Record<StatKey, number>>
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function computePlayerDossier(
  sb: SupabaseClient,
  playerIgn: string
): Promise<ProPlayerDossier | null> {
  // Try to find player meta (best-effort — IGN may not be in pro_players if
  // VLR didn't expose them on a roster page, but we can still aggregate stats).
  const { data: playerRows } = await sb
    .from('pro_players')
    .select('id, ign, country, real_name, current_team_id')
    .ilike('ign', playerIgn)
    .limit(5)
  const playerMeta = (playerRows ?? []) as PlayerRow[]
  const knownIgns = playerMeta.length
    ? Array.from(new Set(playerMeta.map((p) => p.ign)))
    : [playerIgn]

  // Pull every player_map_stats row for this IGN (across team changes).
  const { data: focalPpms } = await sb
    .from('pro_player_map_stats')
    .select(
      'map_result_id, player_id, team_id, ign, agent, acs, k, d, a, plus_minus, fk, fd'
    )
    .in('ign', knownIgns)
  const focalRows = (focalPpms ?? []) as PpmsRow[]

  // If a player has truly zero recorded maps, we 404.
  if (focalRows.length === 0) return null

  // Most recent team_id wins for canonical team
  const focalMapIds = Array.from(new Set(focalRows.map((r) => r.map_result_id)))

  // Pull map_results + matches in parallel so we can resolve dates, opponents,
  // and round counts for the focal player. Also pull the entire league's player
  // stats (capped) so we can compute role peers, baselines, and similars.
  const [mapsRes, allPpmsRes, teamsRes] = await Promise.all([
    sb
      .from('pro_map_results')
      .select('id, match_id, map_name, winner_team_id')
      .in('id', focalMapIds),
    sb
      .from('pro_player_map_stats')
      .select(
        'map_result_id, player_id, team_id, ign, agent, acs, k, d, a, plus_minus, fk, fd'
      )
      .limit(20000),
    sb.from('pro_teams').select('id, name, tag, slug'),
  ])
  const focalMaps = (mapsRes.data ?? []) as MapRow[]
  const allPpms = (allPpmsRes.data ?? []) as PpmsRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const teamById = new Map(teams.map((t) => [t.id, t]))

  // Matches for the focal player's maps
  const focalMatchIds = Array.from(new Set(focalMaps.map((m) => m.match_id)))
  const { data: matchesRes } = await sb
    .from('pro_matches')
    .select('id, team_a_id, team_b_id, winner_team_id, match_date, url')
    .in('id', focalMatchIds)
  const matches = (matchesRes ?? []) as MatchRow[]
  const matchById = new Map(matches.map((m) => [m.id, m]))
  const mapById = new Map(focalMaps.map((m) => [m.id, m]))

  // ── Career aggregates ──
  const career = computeCareer(focalRows, focalMaps, matches)

  // ── Player summary (canonical team = most recent appearance) ──
  const focalSorted = [...focalRows].sort((a, b) => {
    const ma = mapById.get(a.map_result_id)
    const mb = mapById.get(b.map_result_id)
    const da = ma ? matchById.get(ma.match_id)?.match_date ?? '' : ''
    const db = mb ? matchById.get(mb.match_id)?.match_date ?? '' : ''
    return db.localeCompare(da)
  })
  const latestTeamId = focalSorted[0]?.team_id ?? null
  const focalAgg = buildAggregate(focalRows)
  const team = latestTeamId ? teamById.get(latestTeamId) : null
  const meta = playerMeta[0] ?? null
  const player: ProPlayerSummary = {
    ign: focalRows[0].ign,
    realName: meta?.real_name ?? null,
    country: meta?.country ?? null,
    teamId: latestTeamId,
    teamName: team?.name ?? null,
    teamTag: team?.tag ?? null,
    teamSlug: team?.slug ?? null,
    primaryRole: focalAgg.primaryRole,
    signatureAgent: focalAgg.signatureAgent
      ? { agent: focalAgg.signatureAgent, count: focalAgg.agents.get(focalAgg.signatureAgent) ?? 0 }
      : null,
    topAgents: Array.from(focalAgg.agents.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([agent, count]) => ({ agent, count })),
  }

  const sample: 'ok' | 'small' = focalAgg.maps < 5 ? 'small' : 'ok'

  // ── Build aggregates for every player in the league (for percentile / similar / scatter) ──
  const byPlayer = new Map<string, PpmsRow[]>()
  for (const r of allPpms) {
    const key = r.player_id ?? r.ign
    if (!byPlayer.has(key)) byPlayer.set(key, [])
    byPlayer.get(key)!.push(r)
  }
  const allAggs: PlayerAggregate[] = []
  for (const rows of byPlayer.values()) {
    const agg = buildAggregate(rows)
    if (agg.maps < 3) continue
    allAggs.push(agg)
  }
  // Replace the focal aggregate with our authoritative one (which used the full
  // focal set, not just whatever leaked into the 20k cap).
  const focalKey = focalAgg.ign
  const focalAggInList = allAggs.findIndex((a) => a.ign === focalKey)
  if (focalAggInList >= 0) allAggs[focalAggInList] = focalAgg
  else allAggs.push(focalAgg)

  // Compute derived stats for every aggregate (focal included)
  for (const a of allAggs) deriveStats(a)

  // ── Percentile slices vs role peers ──
  const peers = focalAgg.primaryRole
    ? allAggs.filter((a) => a.primaryRole === focalAgg.primaryRole && a.maps >= 5)
    : allAggs.filter((a) => a.maps >= 5)

  const slices: PercentileSlice[] = STAT_ORDER.map((key) => {
    const def = STAT_DEFS[key]
    const focalVal = focalAgg.stats[key]
    let percentile: number | null = null
    if (focalVal != null && peers.length >= 3) {
      const peerVals = peers.map((p) => p.stats[key]).filter((v): v is number => v != null)
      if (peerVals.length >= 3) {
        peerVals.sort((a, b) => a - b)
        const rank = peerVals.filter((v) => v <= focalVal).length
        percentile = Math.round((rank / peerVals.length) * 100)
      }
    }
    return {
      key,
      label: def.label,
      category: def.category,
      value: focalVal == null ? null : Math.round(focalVal * 100) / 100,
      percentile,
      higherBetter: def.higherBetter,
    }
  })

  const topPercentiles = [...slices]
    .filter((s) => s.percentile != null)
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
    .slice(0, 5)

  // ── Similar players via cosine on percentile vector ──
  const focalVector = vectorFromAgg(focalAgg, peers)
  const similarPlayers: SimilarPlayer[] = peers
    .filter((p) => p.ign !== focalAgg.ign)
    .map((p) => {
      const vec = vectorFromAgg(p, peers)
      const sim = cosine(focalVector, vec)
      const team = p.teamId ? teamById.get(p.teamId) : null
      return {
        ign: p.ign,
        teamId: p.teamId,
        teamName: team?.name ?? null,
        primaryRole: p.primaryRole,
        signatureAgent: p.signatureAgent,
        avgAcs: p.stats.acs == null ? null : Math.round(p.stats.acs),
        similarity: Math.round(sim * 1000) / 1000,
        maps: p.maps,
      }
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 12)

  // ── Agent × Map grid ──
  type CellAcc = {
    sumAcs: number; nAcs: number
    sumPm: number;  nPm: number
    played: number
    wins: number
  }
  const cellByKey = new Map<string, CellAcc>()
  for (const r of focalRows) {
    if (!r.agent) continue
    const m = mapById.get(r.map_result_id)
    if (!m) continue
    const key = `${r.agent}__${m.map_name}`
    const acc =
      cellByKey.get(key) ??
      ({ sumAcs: 0, nAcs: 0, sumPm: 0, nPm: 0, played: 0, wins: 0 } as CellAcc)
    cellByKey.set(key, acc)
    acc.played++
    if (m.winner_team_id === r.team_id) acc.wins++
    if (r.acs != null) { acc.sumAcs += r.acs; acc.nAcs++ }
    if (r.plus_minus != null) { acc.sumPm += r.plus_minus; acc.nPm++ }
  }
  const cells: AgentMapCell[] = []
  for (const [key, acc] of cellByKey) {
    const [agent, mapName] = key.split('__')
    cells.push({
      agent,
      mapName,
      sample: acc.played,
      avgAcs: acc.nAcs ? Math.round((acc.sumAcs / acc.nAcs) * 10) / 10 : null,
      avgPlusMinus: acc.nPm ? Math.round((acc.sumPm / acc.nPm) * 10) / 10 : null,
      wins: acc.wins,
      played: acc.played,
      winPct: acc.played ? Math.round((acc.wins / acc.played) * 100) : null,
    })
  }
  // Row order: most-played agents first
  const agentTotals = new Map<string, number>()
  for (const c of cells) agentTotals.set(c.agent, (agentTotals.get(c.agent) ?? 0) + c.played)
  const agents = Array.from(agentTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([a]) => a)
  // Column order: most-played maps first
  const mapTotals = new Map<string, number>()
  for (const c of cells) mapTotals.set(c.mapName, (mapTotals.get(c.mapName) ?? 0) + c.played)
  const mapsList = Array.from(mapTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m)
  const acsVals = cells.map((c) => c.avgAcs).filter((v): v is number => v != null)
  const agentMapGrid = {
    agents,
    maps: mapsList,
    cells,
    maxAcs: acsVals.length ? Math.max(...acsVals) : null,
    minAcs: acsVals.length ? Math.min(...acsVals) : null,
  }

  // ── Peer scatter (K/D vs ACS) ──
  const peerScatter: PeerScatterPoint[] = allAggs
    .filter((a) => a.maps >= 3)
    .filter((a) => a.stats.acs != null && a.stats.kdRatio != null)
    .map((a) => ({
      ign: a.ign,
      teamName: a.teamId ? teamById.get(a.teamId)?.name ?? null : null,
      primaryRole: a.primaryRole,
      x: Math.round((a.stats.kdRatio ?? 0) * 100) / 100,
      y: Math.round(a.stats.acs ?? 0),
      maps: a.maps,
      isFocal: a.ign === focalAgg.ign,
    }))

  // ── Recent form (last 10 maps with stats) ──
  const recentForm: RecentFormEntry[] = focalSorted
    .filter((r) => r.acs != null || r.k != null)
    .slice(0, 10)
    .map((r) => {
      const m = mapById.get(r.map_result_id)
      const match = m ? matchById.get(m.match_id) : null
      const oppId = match
        ? match.team_a_id === r.team_id
          ? match.team_b_id
          : match.team_a_id
        : null
      const oppName = oppId ? teamById.get(oppId)?.name ?? null : null
      const result: 'W' | 'L' | 'T' =
        m?.winner_team_id == null
          ? 'T'
          : m.winner_team_id === r.team_id
          ? 'W'
          : 'L'
      return {
        mapResultId: r.map_result_id,
        date: match?.match_date ?? null,
        mapName: m?.map_name ?? '—',
        agent: r.agent,
        opponentName: oppName,
        acs: r.acs,
        k: r.k,
        d: r.d,
        a: r.a,
        plusMinus: r.plus_minus,
        result,
        matchUrl: match?.url ?? null,
      }
    })

  return {
    player,
    career,
    sample,
    slices,
    topPercentiles,
    similarPlayers,
    agentMapGrid,
    peerScatter,
    recentForm,
  }
}

// ─── Aggregate builders ───────────────────────────────────────────────────────

function buildAggregate(rows: PpmsRow[]): PlayerAggregate {
  const ign = rows[0]?.ign ?? '—'
  const acsValues: number[] = []
  const agents = new Map<string, number>()
  let sumAcs = 0, nAcs = 0
  let sumK = 0, nK = 0
  let sumD = 0, nD = 0
  let sumA = 0, nA = 0
  let sumPm = 0, nPm = 0
  let sumFk = 0, nFk = 0
  let sumFd = 0, nFd = 0
  let mapsWithStats = 0
  const teamCounts = new Map<string, number>()
  for (const r of rows) {
    if (r.team_id) teamCounts.set(r.team_id, (teamCounts.get(r.team_id) ?? 0) + 1)
    if (r.agent) agents.set(r.agent, (agents.get(r.agent) ?? 0) + 1)
    let hasStats = false
    if (r.acs != null) { sumAcs += r.acs; nAcs++; acsValues.push(r.acs); hasStats = true }
    if (r.k != null)   { sumK += r.k;     nK++; hasStats = true }
    if (r.d != null)   { sumD += r.d;     nD++; hasStats = true }
    if (r.a != null)   { sumA += r.a;     nA++; hasStats = true }
    if (r.plus_minus != null) { sumPm += r.plus_minus; nPm++; hasStats = true }
    if (r.fk != null)  { sumFk += r.fk;   nFk++ }
    if (r.fd != null)  { sumFd += r.fd;   nFd++ }
    if (hasStats) mapsWithStats++
  }

  const roleCounts = new Map<AgentRole, number>()
  for (const [agent, count] of agents) {
    const role = roleForAgent(agent)
    if (role) roleCounts.set(role, (roleCounts.get(role) ?? 0) + count)
  }
  let primaryRole: AgentRole | null = null
  let maxN = 0
  for (const [role, n] of roleCounts) {
    if (n > maxN) { primaryRole = role; maxN = n }
  }
  const signatureAgent = Array.from(agents.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const dominantTeamId = Array.from(teamCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    ign,
    teamId: dominantTeamId,
    agents,
    primaryRole,
    signatureAgent,
    maps: mapsWithStats,
    acsValues,
    sumAcs, nAcs,
    sumK, nK,
    sumD, nD,
    sumA, nA,
    sumPm, nPm,
    sumFk, nFk,
    sumFd, nFd,
    stats: {},
  }
}

function deriveStats(a: PlayerAggregate) {
  const avg = (sum: number, n: number) => (n > 0 ? sum / n : null)
  const acs = avg(a.sumAcs, a.nAcs)
  const k = avg(a.sumK, a.nK)
  const d = avg(a.sumD, a.nD)
  const aa = avg(a.sumA, a.nA)
  const pm = avg(a.sumPm, a.nPm)
  const fk = avg(a.sumFk, a.nFk)
  const fd = avg(a.sumFd, a.nFd)
  const kd = k != null && d != null && d > 0 ? k / d : null
  const ka = k != null && aa != null ? k + aa : null
  // Rough survival proxy: 1 - D/24 (since 24 rounds = first-to-13). Negative
  // means death-per-round above 1; clamp to [0, 1] for percentile sanity.
  const survival = d != null ? Math.max(0, Math.min(1, 1 - d / 24)) : null
  const fkfd = fk != null && fd != null ? fk - fd : null
  let consistency: number | null = null
  if (a.acsValues.length >= 3 && acs != null && acs > 0) {
    const mean = acs
    const variance =
      a.acsValues.reduce((s, v) => s + (v - mean) ** 2, 0) / a.acsValues.length
    const stdev = Math.sqrt(variance)
    consistency = Math.max(0, 1 - stdev / mean)
  }

  a.stats.acs = acs ?? undefined
  a.stats.kPerMap = k ?? undefined
  a.stats.kdRatio = kd ?? undefined
  a.stats.plusMinus = pm ?? undefined
  a.stats.aPerMap = aa ?? undefined
  a.stats.fkPerMap = fk ?? undefined
  a.stats.kaPerMap = ka ?? undefined
  a.stats.survivalRate = survival ?? undefined
  a.stats.fkFdDiff = fkfd ?? undefined
  a.stats.consistency = consistency ?? undefined
}

function computeCareer(
  rows: PpmsRow[],
  maps: MapRow[],
  matches: MatchRow[]
): ProPlayerCareer {
  const mapById = new Map(maps.map((m) => [m.id, m]))
  const matchById = new Map(matches.map((m) => [m.id, m]))
  let wins = 0, losses = 0
  let sumAcs = 0, nAcs = 0
  let sumK = 0, nK = 0
  let sumD = 0, nD = 0
  let sumA = 0, nA = 0
  let sumPm = 0, nPm = 0
  let sumFk = 0, nFk = 0
  let mapsWithStats = 0
  const seenMatches = new Set<string>()
  let lastPlayed: string | null = null
  for (const r of rows) {
    const m = mapById.get(r.map_result_id)
    if (m) {
      if (m.winner_team_id === r.team_id) wins++
      else if (m.winner_team_id) losses++
      const match = matchById.get(m.match_id)
      if (match) {
        seenMatches.add(match.id)
        if (match.match_date && (!lastPlayed || match.match_date > lastPlayed)) {
          lastPlayed = match.match_date
        }
      }
    }
    let hasStats = false
    if (r.acs != null) { sumAcs += r.acs; nAcs++; hasStats = true }
    if (r.k != null)   { sumK += r.k;     nK++; hasStats = true }
    if (r.d != null)   { sumD += r.d;     nD++; hasStats = true }
    if (r.a != null)   { sumA += r.a;     nA++; hasStats = true }
    if (r.plus_minus != null) { sumPm += r.plus_minus; nPm++ }
    if (r.fk != null)  { sumFk += r.fk;   nFk++ }
    if (hasStats) mapsWithStats++
  }
  const round = (v: number | null, dp = 1) =>
    v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp
  const avgK = nK ? sumK / nK : null
  const avgD = nD ? sumD / nD : null
  return {
    matches: seenMatches.size,
    maps: mapsWithStats,
    wins,
    losses,
    winPct: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
    avgAcs: nAcs ? Math.round(sumAcs / nAcs) : null,
    avgK: round(avgK),
    avgD: round(avgD),
    avgA: nA ? round(sumA / nA) : null,
    avgPlusMinus: nPm ? round(sumPm / nPm) : null,
    avgFk: nFk ? round(sumFk / nFk, 2) : null,
    kdRatio: avgK != null && avgD != null && avgD > 0 ? round(avgK / avgD, 2) : null,
    lastPlayed,
  }
}

// ─── Vector / similarity ──────────────────────────────────────────────────────

function vectorFromAgg(a: PlayerAggregate, peers: PlayerAggregate[]): number[] {
  // For each stat, compute z-score within peers; missing → 0
  return STAT_ORDER.map((key) => {
    const vals = peers.map((p) => p.stats[key]).filter((v): v is number => v != null)
    if (vals.length < 3) return 0
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
    const stdev = Math.sqrt(variance) || 1
    const v = a.stats[key]
    if (v == null) return 0
    return (v - mean) / stdev
  })
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (denom === 0) return 0
  // Map [-1, 1] → [0, 1] so 1 = identical, 0.5 = orthogonal, 0 = opposite
  return (dot / denom + 1) / 2
}
