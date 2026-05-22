/**
 * Internal player dossier compute.
 *
 * Pulls match_players across every match the user can see (RLS-scoped, so
 * Scylla + Hydra + every opponent ever scrimmed end up in one pool), computes
 * percentile slices vs role peers, cosine-similar players, agent×map grid,
 * peer scatter, and the focal player's recent form + kill positions.
 *
 * Stats here are intentionally derivable from `match_players` aggregates only
 * (no rounds, no kill_events) so the peer pool stays cheap. The existing
 * `computePlayerStats` / `computePlayerImpact` on the page still surfaces the
 * richer focal-only metrics (KAST, drag, carry, trade rate) below.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { roleForAgent, type AgentRole } from '@/lib/pro-scout/agent-roles'
import type {
  AgentMapCell,
  PercentileCategory,
  PercentileSlice,
  PeerScatterPoint,
  SimilarPlayer,
} from '@/lib/pro-scout/types'

// ─── Stat shape ───────────────────────────────────────────────────────────────

type StatKey =
  | 'acs'
  | 'adr'
  | 'hsPct'
  | 'kPerMap'
  | 'plusMinus'
  | 'fkPerMap'
  | 'multiKRate'
  | 'kaPerMap'
  | 'survivalRate'
  | 'consistency'

const STAT_DEFS: Record<
  StatKey,
  { label: string; category: PercentileCategory; higherBetter: boolean }
> = {
  acs:          { label: 'ACS',          category: 'firepower',   higherBetter: true },
  adr:          { label: 'ADR',          category: 'firepower',   higherBetter: true },
  hsPct:        { label: 'HS %',         category: 'firepower',   higherBetter: true },
  kPerMap:      { label: 'K / map',      category: 'firepower',   higherBetter: true },
  plusMinus:    { label: '+/- per map',  category: 'impact',      higherBetter: true },
  fkPerMap:     { label: 'FK / map',     category: 'impact',      higherBetter: true },
  multiKRate:   { label: 'Multi-K / g',  category: 'impact',      higherBetter: true },
  kaPerMap:     { label: 'K+A / map',    category: 'survival',    higherBetter: true },
  survivalRate: { label: 'Survival %',   category: 'survival',    higherBetter: true },
  consistency:  { label: 'ACS consist.', category: 'consistency', higherBetter: true },
}

const STAT_ORDER: StatKey[] = [
  'acs', 'adr', 'hsPct', 'kPerMap',
  'plusMinus', 'fkPerMap', 'multiKRate',
  'kaPerMap', 'survivalRate',
  'consistency',
]

type MatchRow = {
  id: string
  team_id: string
  match_date: string | null
  opponent_name: string | null
  map_name: string | null
  result: string | null
}

type MatchPlayerRow = {
  match_id: string
  player_id: string | null
  puuid: string | null
  riot_name: string | null
  riot_tag: string | null
  agent: string | null
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
  plus_minus: number | null
  fk: number | null
  fd: number | null
  adr: number | null
  hs: number | null
  bs: number | null
  ls: number | null
  two_k: number | null
  three_k: number | null
  four_k: number | null
  aces: number | null
  damage_made: number | null
  damage_received: number | null
}

type TeamRow = { id: string; name: string }

type PlayerAggregate = {
  key: string                 // player_id ?? `${riot_name}#${riot_tag}` ?? riot_name
  displayName: string
  isFocal: boolean
  teamId: string | null       // dominant team_id observed across their match_players rows
  agents: Map<string, number>
  primaryRole: AgentRole | null
  signatureAgent: string | null
  maps: number                // # of match_player rows with at least one stat
  acsSeries: number[]
  sums: Record<string, number>
  counts: Record<string, number>
  stats: Partial<Record<StatKey, number>>
}

export type InternalRecentFormEntry = {
  matchId: string
  date: string | null
  opponent: string | null
  mapName: string | null
  agent: string | null
  result: 'W' | 'L' | 'T'
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
  plusMinus: number | null
}

export type InternalPlayerDossier = {
  focal: {
    playerId: string
    displayName: string
    teamId: string | null
    teamName: string | null
    primaryRole: AgentRole | null
    signatureAgent: { agent: string; count: number } | null
    topAgents: { agent: string; count: number }[]
    maps: number
    puuids: string[]
  }
  sample: 'ok' | 'small'
  slices: PercentileSlice[]
  topPercentiles: PercentileSlice[]
  similarPlayers: SimilarPlayer[]
  agentMapGrid: {
    agents: string[]
    maps: string[]
    cells: AgentMapCell[]
    minAcs: number | null
    maxAcs: number | null
  }
  peerScatter: PeerScatterPoint[]
  topMaps: { mapName: string; played: number; puuids: string[] }[]
  recentForm: InternalRecentFormEntry[]
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function computeInternalPlayerDossier(
  sb: SupabaseClient,
  playerId: string
): Promise<InternalPlayerDossier | null> {
  // ── Identify focal player ──
  const { data: focalPlayer } = await sb
    .from('players')
    .select('id, display_name, team_id, main_agent')
    .eq('id', playerId)
    .single()
  if (!focalPlayer) return null

  // ── Pull every match the user can see (RLS limits to teams they own) ──
  // We deliberately don't filter by team_id — this gives us Scylla+Hydra in
  // one query if the user owns both.
  const { data: matchesRaw } = await sb
    .from('matches')
    .select('id, team_id, match_date, opponent_name, map_name, result')
    .is('deleted_at', null)
    .order('match_date', { ascending: false })
    .limit(1000)
  const matches = (matchesRaw ?? []) as MatchRow[]
  if (matches.length === 0) return null
  const matchById = new Map(matches.map((m) => [m.id, m]))
  const matchIds = matches.map((m) => m.id)

  // ── Pull all match_players + team meta + roster lookup in parallel ──
  const [mpRes, teamsRes, playersRes] = await Promise.all([
    sb
      .from('match_players')
      .select(
        'match_id, player_id, puuid, riot_name, riot_tag, agent, acs, k, d, a, plus_minus, fk, fd, adr, hs, bs, ls, two_k, three_k, four_k, aces, damage_made, damage_received'
      )
      .in('match_id', matchIds)
      .limit(20000),
    sb.from('teams').select('id, name'),
    sb.from('players').select('id, team_id, display_name'),
  ])
  const matchPlayers = (mpRes.data ?? []) as MatchPlayerRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const playerById = new Map(
    ((playersRes.data ?? []) as { id: string; team_id: string | null; display_name: string }[])
      .map((p) => [p.id, p])
  )

  // ── Build per-player aggregates ──
  const byPlayer = new Map<string, MatchPlayerRow[]>()
  for (const mp of matchPlayers) {
    const k = keyForPlayer(mp)
    if (!byPlayer.has(k)) byPlayer.set(k, [])
    byPlayer.get(k)!.push(mp)
  }
  // Focal player by ID — but also pre-resolve their key so we can pin them in
  // the aggregate list.
  const focalRows = matchPlayers.filter((mp) => mp.player_id === playerId)
  if (focalRows.length === 0) return null
  const focalKey = keyForPlayer(focalRows[0])

  const allAggs: PlayerAggregate[] = []
  for (const [key, rows] of byPlayer) {
    const agg = buildAggregate(key, rows)
    if (agg.maps < 3) continue
    // Resolve team + canonical display_name for known roster players
    if (rows[0].player_id) {
      const pl = playerById.get(rows[0].player_id)
      if (pl) {
        agg.teamId = pl.team_id
        agg.displayName = pl.display_name
      }
    }
    allAggs.push(agg)
  }
  // Ensure focal is present even if their sample is <3
  let focalAgg = allAggs.find((a) => a.key === focalKey)
  if (!focalAgg) {
    focalAgg = buildAggregate(focalKey, focalRows)
    allAggs.push(focalAgg)
  }
  focalAgg.isFocal = true
  focalAgg.teamId = focalPlayer.team_id
  focalAgg.displayName = focalPlayer.display_name

  for (const a of allAggs) deriveStats(a)

  // ── Percentile slices vs role peers ──
  const peers = focalAgg.primaryRole
    ? allAggs.filter((a) => a.primaryRole === focalAgg!.primaryRole && a.maps >= 3)
    : allAggs.filter((a) => a.maps >= 3)

  const slices: PercentileSlice[] = STAT_ORDER.map((key) => {
    const def = STAT_DEFS[key]
    const focalVal = focalAgg!.stats[key]
    let percentile: number | null = null
    if (focalVal != null && peers.length >= 3) {
      const peerVals = peers.map((p) => p.stats[key]).filter((v): v is number => v != null)
      if (peerVals.length >= 3) {
        peerVals.sort((x, y) => x - y)
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

  // ── Similar players via cosine on z-scored percentile vector ──
  const focalVec = vectorFromAgg(focalAgg, peers)
  const similarPlayers: SimilarPlayer[] = peers
    .filter((p) => p.key !== focalAgg!.key)
    .map((p) => {
      const team = p.teamId ? teamById.get(p.teamId) : null
      const linkId = p.key.startsWith('pid:') ? p.key.slice(4) : null
      return {
        ign: p.displayName,
        teamId: p.teamId,
        teamName: team?.name ?? labelForOpponentTeam(p),
        primaryRole: p.primaryRole,
        signatureAgent: p.signatureAgent,
        avgAcs: p.stats.acs == null ? null : Math.round(p.stats.acs),
        similarity: Math.round(cosine(focalVec, vectorFromAgg(p, peers)) * 1000) / 1000,
        maps: p.maps,
        linkId,
      }
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 12)

  // ── Agent × Map grid (focal player only) ──
  type CellAcc = {
    sumAcs: number; nAcs: number
    sumPm: number;  nPm: number
    played: number
    wins: number
  }
  const cellByKey = new Map<string, CellAcc>()
  for (const r of focalRows) {
    const m = matchById.get(r.match_id)
    if (!m || !m.map_name || !r.agent) continue
    const key = `${r.agent}__${m.map_name}`
    const acc =
      cellByKey.get(key) ??
      ({ sumAcs: 0, nAcs: 0, sumPm: 0, nPm: 0, played: 0, wins: 0 } as CellAcc)
    cellByKey.set(key, acc)
    acc.played++
    if (m.result === 'W') acc.wins++
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
  const agentTotals = new Map<string, number>()
  for (const c of cells) agentTotals.set(c.agent, (agentTotals.get(c.agent) ?? 0) + c.played)
  const mapTotals = new Map<string, number>()
  for (const c of cells) mapTotals.set(c.mapName, (mapTotals.get(c.mapName) ?? 0) + c.played)
  const agents = Array.from(agentTotals.entries()).sort((a, b) => b[1] - a[1]).map(([a]) => a)
  const mapsList = Array.from(mapTotals.entries()).sort((a, b) => b[1] - a[1]).map(([m]) => m)
  const acsVals = cells.map((c) => c.avgAcs).filter((v): v is number => v != null)

  // ── Peer scatter ──
  const peerScatter: PeerScatterPoint[] = allAggs
    .filter((a) => a.maps >= 3)
    .filter((a) => a.stats.acs != null && a.stats.kPerMap != null && (focalAgg!.stats.kPerMap ?? 0) >= 0)
    .map((a) => {
      const d = (a.counts.d ? a.sums.d / a.counts.d : null) ?? null
      const k = a.stats.kPerMap
      const kd = k != null && d != null && d > 0 ? k / d : null
      return {
        ign: a.displayName,
        teamName: a.teamId ? teamById.get(a.teamId)?.name ?? labelForOpponentTeam(a) : labelForOpponentTeam(a),
        primaryRole: a.primaryRole,
        x: kd == null ? 0 : Math.round(kd * 100) / 100,
        y: Math.round(a.stats.acs ?? 0),
        maps: a.maps,
        isFocal: a.key === focalAgg!.key,
      }
    })
    .filter((p) => p.x > 0)

  // ── Top maps for the kill-position heatmap strip ──
  const focalMapCounts = new Map<string, number>()
  for (const r of focalRows) {
    const m = matchById.get(r.match_id)
    if (!m?.map_name) continue
    focalMapCounts.set(m.map_name, (focalMapCounts.get(m.map_name) ?? 0) + 1)
  }
  const topMaps = Array.from(focalMapCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mapName, played]) => ({
      mapName,
      played,
      puuids: Array.from(new Set(focalRows.map((r) => r.puuid).filter((p): p is string => !!p))),
    }))

  // ── Recent form (last 10 focal maps) ──
  const recentForm: InternalRecentFormEntry[] = focalRows
    .map((r) => ({ row: r, match: matchById.get(r.match_id) }))
    .filter(({ match }) => !!match)
    .sort((a, b) => (b.match!.match_date ?? '').localeCompare(a.match!.match_date ?? ''))
    .slice(0, 10)
    .map(({ row, match }) => {
      const result: 'W' | 'L' | 'T' =
        match!.result === 'W' ? 'W' : match!.result === 'L' ? 'L' : 'T'
      return {
        matchId: match!.id,
        date: match!.match_date,
        opponent: match!.opponent_name,
        mapName: match!.map_name,
        agent: row.agent,
        result,
        acs: row.acs,
        k: row.k,
        d: row.d,
        a: row.a,
        plusMinus: row.plus_minus,
      }
    })

  const focalTeam = focalPlayer.team_id ? teamById.get(focalPlayer.team_id) : null

  // Collect focal puuids (player may have multiple over time)
  const puuids = Array.from(
    new Set(focalRows.map((r) => r.puuid).filter((p): p is string => !!p))
  )

  return {
    focal: {
      playerId: focalPlayer.id,
      displayName: focalPlayer.display_name,
      teamId: focalPlayer.team_id,
      teamName: focalTeam?.name ?? null,
      primaryRole: focalAgg.primaryRole,
      signatureAgent: focalAgg.signatureAgent
        ? {
            agent: focalAgg.signatureAgent,
            count: focalAgg.agents.get(focalAgg.signatureAgent) ?? 0,
          }
        : null,
      topAgents: Array.from(focalAgg.agents.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([agent, count]) => ({ agent, count })),
      maps: focalAgg.maps,
      puuids,
    },
    sample: focalAgg.maps < 5 ? 'small' : 'ok',
    slices,
    topPercentiles,
    similarPlayers,
    agentMapGrid: {
      agents,
      maps: mapsList,
      cells,
      minAcs: acsVals.length ? Math.min(...acsVals) : null,
      maxAcs: acsVals.length ? Math.max(...acsVals) : null,
    },
    peerScatter,
    topMaps,
    recentForm,
  }
}

// ─── Aggregate builders ───────────────────────────────────────────────────────

function keyForPlayer(mp: MatchPlayerRow): string {
  if (mp.player_id) return `pid:${mp.player_id}`
  if (mp.riot_name && mp.riot_tag) return `riot:${mp.riot_name}#${mp.riot_tag}`
  return `name:${mp.riot_name ?? 'unknown'}`
}

function labelForOpponentTeam(a: PlayerAggregate): string | null {
  // For non-team rows (opposing players from scrims), there's no teams.name
  // entry. We don't have opponent team mapping cheaply available here, so just
  // return 'scrim opponent' as a placeholder.
  return a.teamId ? null : 'scrim opponent'
}

function buildAggregate(key: string, rows: MatchPlayerRow[]): PlayerAggregate {
  const first = rows[0]
  const displayName =
    first.riot_name && first.riot_tag
      ? `${first.riot_name}#${first.riot_tag}`
      : first.riot_name ?? 'unknown'

  const agents = new Map<string, number>()
  const acsSeries: number[] = []
  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}
  let mapsWithStats = 0
  for (const r of rows) {
    if (r.agent) agents.set(r.agent, (agents.get(r.agent) ?? 0) + 1)
    // We track team_id from match join later — for now use player_id-derived
    // teaminess (skip — set externally if needed)
    let hasStats = false
    const addStat = (k: string, v: number | null) => {
      if (v == null) return
      sums[k] = (sums[k] ?? 0) + v
      counts[k] = (counts[k] ?? 0) + 1
      hasStats = true
    }
    addStat('acs', r.acs)
    if (r.acs != null) acsSeries.push(r.acs)
    addStat('adr', r.adr)
    if (r.hs != null && r.bs != null && r.ls != null) {
      const total = r.hs + r.bs + r.ls
      if (total > 0) addStat('hsPct', (r.hs / total) * 100)
    }
    addStat('k', r.k)
    addStat('d', r.d)
    addStat('a', r.a)
    addStat('plusMinus', r.plus_minus)
    addStat('fk', r.fk)
    addStat('fd', r.fd)
    addStat('twoK', r.two_k)
    addStat('threeK', r.three_k)
    addStat('fourK', r.four_k)
    addStat('aces', r.aces)
    if (r.damage_made != null && r.damage_received != null) {
      addStat('damDelta', r.damage_made - r.damage_received)
    }
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

  return {
    key,
    displayName,
    isFocal: false,
    teamId: null,
    agents,
    primaryRole,
    signatureAgent,
    maps: mapsWithStats,
    acsSeries,
    sums,
    counts,
    stats: {},
  }
}

function deriveStats(a: PlayerAggregate) {
  const avg = (k: string) => (a.counts[k] ? a.sums[k] / a.counts[k] : null)
  const acs = avg('acs')
  const adr = avg('adr')
  const hsPct = avg('hsPct')
  const k = avg('k')
  const d = avg('d')
  const aa = avg('a')
  const pm = avg('plusMinus')
  const fk = avg('fk')
  const twoK = avg('twoK') ?? 0
  const threeK = avg('threeK') ?? 0
  const fourK = avg('fourK') ?? 0
  const aces = avg('aces') ?? 0
  const multiKRate = twoK + threeK + fourK + aces
  const ka = k != null && aa != null ? k + aa : null
  // Survival: clamp 1 - d/24
  const survival = d != null ? Math.max(0, Math.min(1, 1 - d / 24)) * 100 : null
  // Consistency: 1 - stdev/mean (z-scoreless coefficient-of-variation invert)
  let consistency: number | null = null
  if (a.acsSeries.length >= 3 && acs != null && acs > 0) {
    const mean = acs
    const variance = a.acsSeries.reduce((s, v) => s + (v - mean) ** 2, 0) / a.acsSeries.length
    const stdev = Math.sqrt(variance)
    consistency = Math.max(0, 1 - stdev / mean) * 100
  }

  a.stats.acs = acs ?? undefined
  a.stats.adr = adr ?? undefined
  a.stats.hsPct = hsPct ?? undefined
  a.stats.kPerMap = k ?? undefined
  a.stats.plusMinus = pm ?? undefined
  a.stats.fkPerMap = fk ?? undefined
  a.stats.multiKRate = multiKRate
  a.stats.kaPerMap = ka ?? undefined
  a.stats.survivalRate = survival ?? undefined
  a.stats.consistency = consistency ?? undefined
}

// ─── Vector / similarity ──────────────────────────────────────────────────────

function vectorFromAgg(a: PlayerAggregate, peers: PlayerAggregate[]): number[] {
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
  return (dot / denom + 1) / 2
}

// ─── Kill events fetch helper ─────────────────────────────────────────────────
// Returns the focal player's kill_events for the given maps, partitioned by
// map. The page calls this after computeInternalPlayerDossier so we can scope
// the (potentially large) kill_events query to just the top-3 maps the focal
// played most.

export async function fetchFocalKillEvents(
  sb: SupabaseClient,
  puuids: string[],
  mapNames: string[]
): Promise<Map<string, Array<{
  killer_x: number | null
  killer_y: number | null
  victim_x: number | null
  victim_y: number | null
  isKill: boolean
}>>> {
  const empty = new Map<string, Array<{
    killer_x: number | null
    killer_y: number | null
    victim_x: number | null
    victim_y: number | null
    isKill: boolean
  }>>()
  if (puuids.length === 0 || mapNames.length === 0) return empty

  // Map_name lives on matches, not kill_events. Resolve match_ids per map first.
  const { data: matchesRaw } = await sb
    .from('matches')
    .select('id, map_name')
    .in('map_name', mapNames)
    .is('deleted_at', null)
  const matches = (matchesRaw ?? []) as { id: string; map_name: string | null }[]
  const matchToMap = new Map(matches.map((m) => [m.id, m.map_name]))
  const matchIds = matches.map((m) => m.id)
  if (matchIds.length === 0) return empty

  // Pull kills where the focal player was either killer or victim.
  // We do two queries (killer / victim) and merge — Supabase doesn't have an OR
  // across two .in() clauses on different columns cheaply.
  const [asKillerRes, asVictimRes] = await Promise.all([
    sb
      .from('kill_events')
      .select('match_id, killer_x, killer_y, victim_x, victim_y, killer_puuid, victim_puuid')
      .in('match_id', matchIds)
      .in('killer_puuid', puuids)
      .limit(5000),
    sb
      .from('kill_events')
      .select('match_id, killer_x, killer_y, victim_x, victim_y, killer_puuid, victim_puuid')
      .in('match_id', matchIds)
      .in('victim_puuid', puuids)
      .limit(5000),
  ])
  type KRow = {
    match_id: string
    killer_x: number | null
    killer_y: number | null
    victim_x: number | null
    victim_y: number | null
    killer_puuid: string | null
    victim_puuid: string | null
  }
  const rows = [
    ...((asKillerRes.data ?? []) as KRow[]),
    ...((asVictimRes.data ?? []) as KRow[]),
  ]

  const puuidSet = new Set(puuids)
  const byMap = new Map<string, Array<{
    killer_x: number | null
    killer_y: number | null
    victim_x: number | null
    victim_y: number | null
    isKill: boolean
  }>>()
  const seen = new Set<string>() // dedupe in case a row appears in both halves
  for (const r of rows) {
    const dedupeKey = `${r.match_id}|${r.killer_puuid}|${r.victim_puuid}|${r.killer_x}|${r.killer_y}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const mapName = matchToMap.get(r.match_id)
    if (!mapName) continue
    const list = byMap.get(mapName) ?? []
    byMap.set(mapName, list)
    list.push({
      killer_x: r.killer_x,
      killer_y: r.killer_y,
      victim_x: r.victim_x,
      victim_y: r.victim_y,
      isKill: !!r.killer_puuid && puuidSet.has(r.killer_puuid),
    })
  }
  return byMap
}
