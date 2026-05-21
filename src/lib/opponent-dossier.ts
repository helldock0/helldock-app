import type { DashMatch, DashRound } from '@/lib/dashboard'
import { pct } from '@/lib/dashboard'
import { classifyArchetype, type Archetype } from '@/lib/analytics'

export type DossierOppPlayer = {
  match_id: string
  agent: string | null
  riot_id_full: string | null
  opp_player_name: string | null
  acs: number | null
  k: number | null
  d: number | null
}

export type DossierMatchPlayer = {
  match_id: string
  player_id: string
  agent: string | null
  acs: number | null
  display_name: string | null
}

export type DossierMatch = DashMatch & {
  pick: string | null
  start_side: string | null
  opp_agents: string[] | null
}

export type DossierMap = {
  map: string
  total: number
  oppWins: number
  oppLosses: number
  oppWinPct: number | null
  lastPlayed: string | null
}

export type DossierComp = {
  agents: string[]
  archetype: Archetype
  played: number
  oppWins: number
}

export type DossierOurComp = {
  agents: string[]
  archetype: Archetype
  played: number
  ourWins: number
  ourWinPct: number | null
}

export type DossierSite = {
  map: string
  site: 'A' | 'B' | 'C'
  ourWins: number
  total: number
  ourWinPct: number | null
}

export type DossierTendencies = {
  pistolOppWPct: number | null // their pistol W% when they faced us
  pistolN: number
  plantRate: number | null // % of their ATT rounds where they planted
  plantN: number
  avgTheirUlts: number | null // avg `their_ults_used` per round
  ultN: number
}

// S26 — deeper tendency mining. All computed over the opp's ATT half
// (= rounds where our `side === 'Defense'`).

export type OppSetupPhase =
  | 'Pistol'
  | 'Pistol-carry'
  | 'Early'
  | 'Mid'
  | 'Late'
  | 'OT'

export type DossierSetupByRound = {
  phase: OppSetupPhase
  total: number          // opp ATT rounds in this phase across all matches
  oppWins: number        // our outcome === 'L'
  plants: number
  oppWinPct: number | null
  plantRate: number | null
  avgPlantTime: number | null   // seconds, plant rounds only
}

export type ExecTimingBucket = 'Fast (<30s)' | 'Default (30-60s)' | 'Slow (>60s)'

export type DossierExecTiming = {
  map: string
  total: number          // # of their plants on this map
  buckets: { bucket: ExecTimingBucket; count: number; pct: number }[]
  modal: ExecTimingBucket | null   // most common bucket
}

export type DossierSiteByHalf = {
  map: string
  firstHalf: { total: number; a: number; b: number; c: number; aPct: number | null; bPct: number | null; cPct: number | null }
  secondHalf: { total: number; a: number; b: number; c: number; aPct: number | null; bPct: number | null; cPct: number | null }
  swing: { site: 'A' | 'B' | 'C'; deltaPp: number }[]   // sites whose share moved between halves
}

export type DossierDeepTendencies = {
  setupsByRound: DossierSetupByRound[]
  execTimingByMap: DossierExecTiming[]
  siteByHalf: DossierSiteByHalf[]
}

export type DossierPlayerStat = {
  riotIdFull: string | null
  displayName: string | null
  matches: number
  avgAcs: number | null
  agents: { agent: string; count: number }[]
}

export type OpponentDossier = {
  name: string
  played: number
  wins: number
  losses: number
  winPct: number | null
  lastMet: string | null
  pickSplit: { ourPick: number; theirPick: number; decider: number }
  history: {
    matchIdHelldock: string
    date: string
    map: string | null
    ourScore: number | null
    oppScore: number | null
    result: string | null
  }[]
  maps: DossierMap[]
  theirRoster: DossierPlayerStat[]
  theirTopComps: DossierComp[]
  tendencies: DossierTendencies
  deepTendencies: DossierDeepTendencies
  ourBestComps: DossierOurComp[]
  ourTopFragger: { name: string; avgAcs: number } | null
  ourSiteConversions: DossierSite[]
}

/** Case-insensitive equality on trimmed opponent names. */
export function normalizeOpponentName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

// ── Deep-tendency helpers ────────────────────────────────────────────────────

// Position within a half (1–12). Used to bucket setups regardless of which
// half the opp is ATTACKING in (which depends on start_side).
function positionInHalf(roundNum: number): { phase: OppSetupPhase; pos: number } | null {
  if (roundNum <= 12) return { phase: phaseForPosition(roundNum), pos: roundNum }
  if (roundNum <= 24) {
    const pos = roundNum - 12
    return { phase: phaseForPosition(pos), pos }
  }
  // OT rounds collapse to OT phase
  return { phase: 'OT', pos: roundNum - 24 }
}

function phaseForPosition(pos: number): OppSetupPhase {
  if (pos === 1) return 'Pistol'
  if (pos === 2 || pos === 3) return 'Pistol-carry'
  if (pos >= 4 && pos <= 6) return 'Early'
  if (pos >= 7 && pos <= 9) return 'Mid'
  if (pos >= 10 && pos <= 12) return 'Late'
  return 'OT'
}

function bucketForPlantTime(seconds: number): ExecTimingBucket {
  if (seconds < 30) return 'Fast (<30s)'
  if (seconds <= 60) return 'Default (30-60s)'
  return 'Slow (>60s)'
}

const PHASE_ORDER: OppSetupPhase[] = ['Pistol', 'Pistol-carry', 'Early', 'Mid', 'Late', 'OT']

/**
 * Group opp's ATT-half rounds by phase (round-position within the half), then
 * compute total / wins / plants / avg plant time per phase. The phase is the
 * opp's perspective regardless of which half they attacked.
 *
 * "Their ATT" = our `side === 'Defense'` rounds.
 */
export function computeOppSetupsByRound(rounds: DashRound[]): DossierSetupByRound[] {
  type Bag = { total: number; oppWins: number; plants: number; plantTimeSum: number }
  const byPhase: Record<OppSetupPhase, Bag> = {
    Pistol: { total: 0, oppWins: 0, plants: 0, plantTimeSum: 0 },
    'Pistol-carry': { total: 0, oppWins: 0, plants: 0, plantTimeSum: 0 },
    Early: { total: 0, oppWins: 0, plants: 0, plantTimeSum: 0 },
    Mid: { total: 0, oppWins: 0, plants: 0, plantTimeSum: 0 },
    Late: { total: 0, oppWins: 0, plants: 0, plantTimeSum: 0 },
    OT: { total: 0, oppWins: 0, plants: 0, plantTimeSum: 0 },
  }
  for (const r of rounds) {
    if (r.side !== 'Defense') continue   // opp wasn't attacking
    const pos = positionInHalf(r.round_num)
    if (!pos) continue
    const bag = byPhase[pos.phase]
    bag.total++
    if (r.outcome === 'L') bag.oppWins++
    if (r.plant_time_in_round != null) {
      bag.plants++
      bag.plantTimeSum += r.plant_time_in_round
    }
  }
  return PHASE_ORDER.filter((p) => byPhase[p].total > 0).map((phase) => {
    const b = byPhase[phase]
    return {
      phase,
      total: b.total,
      oppWins: b.oppWins,
      plants: b.plants,
      oppWinPct: pct(b.oppWins, b.total),
      plantRate: pct(b.plants, b.total),
      avgPlantTime:
        b.plants > 0 ? Math.round((b.plantTimeSum / b.plants) * 10) / 10 : null,
    }
  })
}

/**
 * Per map: bucket THEIR plants by `plant_time_in_round` (fast / default / slow)
 * and return distribution + the modal bucket. Maps with <3 plants are filtered
 * (low-sample noise).
 */
export function computeOppExecuteTiming(
  rounds: DashRound[],
  matchIdToMap: Record<string, string | null>
): DossierExecTiming[] {
  type MapBag = Record<ExecTimingBucket, number>
  const byMap: Record<string, MapBag> = {}
  for (const r of rounds) {
    if (r.side !== 'Defense') continue
    if (r.plant_time_in_round == null) continue
    const map = matchIdToMap[r.match_id]
    if (!map) continue
    const bag =
      byMap[map] ??
      { 'Fast (<30s)': 0, 'Default (30-60s)': 0, 'Slow (>60s)': 0 }
    const bucket = bucketForPlantTime(r.plant_time_in_round)
    bag[bucket]++
    byMap[map] = bag
  }
  return Object.keys(byMap)
    .map((map) => {
      const bag = byMap[map]
      const total = bag['Fast (<30s)'] + bag['Default (30-60s)'] + bag['Slow (>60s)']
      const buckets = (Object.keys(bag) as ExecTimingBucket[]).map((bucket) => ({
        bucket,
        count: bag[bucket],
        pct: total > 0 ? Math.round((bag[bucket] / total) * 100) : 0,
      }))
      const modal =
        buckets.reduce<{ b: ExecTimingBucket; c: number } | null>((best, b) => {
          if (b.count === 0) return best
          if (!best || b.count > best.c) return { b: b.bucket, c: b.count }
          return best
        }, null)?.b ?? null
      return { map, total, buckets, modal }
    })
    .filter((m) => m.total >= 3)
    .sort((a, b) => b.total - a.total)
}

/**
 * Per map: A/B/C site split for opp's ATT rounds, broken down by which half
 * (our 1st = rounds 1-12, our 2nd = rounds 13-24). Returns the swing: sites
 * whose share between halves differs by ≥20pp. Maps with <4 their-plants
 * across both halves filtered out.
 */
export function computeOppSiteByHalf(
  rounds: DashRound[],
  matchIdToMap: Record<string, string | null>
): DossierSiteByHalf[] {
  type Sites = { total: number; a: number; b: number; c: number }
  type MapBag = { first: Sites; second: Sites }
  const empty = (): Sites => ({ total: 0, a: 0, b: 0, c: 0 })
  const byMap: Record<string, MapBag> = {}
  for (const r of rounds) {
    if (r.side !== 'Defense') continue
    if (!r.site || (r.site !== 'A' && r.site !== 'B' && r.site !== 'C')) continue
    if (r.plant_time_in_round == null) continue   // exclude no-plant rounds
    const map = matchIdToMap[r.match_id]
    if (!map) continue
    const bag = byMap[map] ?? { first: empty(), second: empty() }
    const half = r.round_num <= 12 ? bag.first : r.round_num <= 24 ? bag.second : null
    if (!half) continue   // skip OT
    half.total++
    if (r.site === 'A') half.a++
    else if (r.site === 'B') half.b++
    else half.c++
    byMap[map] = bag
  }
  return Object.keys(byMap)
    .map((map) => {
      const m = byMap[map]
      const summarize = (s: Sites) => ({
        total: s.total,
        a: s.a,
        b: s.b,
        c: s.c,
        aPct: pct(s.a, s.total),
        bPct: pct(s.b, s.total),
        cPct: pct(s.c, s.total),
      })
      const first = summarize(m.first)
      const second = summarize(m.second)
      const swing: { site: 'A' | 'B' | 'C'; deltaPp: number }[] = []
      ;(['A', 'B', 'C'] as const).forEach((site) => {
        const key = site === 'A' ? 'aPct' : site === 'B' ? 'bPct' : 'cPct'
        const f = first[key]
        const s = second[key]
        if (f == null || s == null) return
        const delta = s - f
        if (Math.abs(delta) >= 20) swing.push({ site, deltaPp: delta })
      })
      swing.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp))
      return { map, firstHalf: first, secondHalf: second, swing }
    })
    .filter((m) => m.firstHalf.total + m.secondHalf.total >= 4)
    .sort(
      (a, b) =>
        b.firstHalf.total + b.secondHalf.total -
        (a.firstHalf.total + a.secondHalf.total)
    )
}

export function computeOpponentDossier(
  oppName: string,
  matches: DossierMatch[],
  rounds: DashRound[],
  matchPlayers: DossierMatchPlayer[],
  oppPlayers: DossierOppPlayer[]
): OpponentDossier | null {
  const target = normalizeOpponentName(oppName)
  if (!target) return null
  const ms = matches.filter((m) => normalizeOpponentName(m.opponent_name) === target)
  if (ms.length === 0) return null

  const matchIds = new Set(ms.map((m) => m.id))
  const ms_rounds = rounds.filter((r) => matchIds.has(r.match_id))
  const ms_mp = matchPlayers.filter((mp) => matchIds.has(mp.match_id))
  const ms_op = oppPlayers.filter((op) => matchIds.has(op.match_id))

  // Canonical display name (use the most recent recorded casing, not the lowercased target)
  const sortedDesc = [...ms].sort((a, b) => b.match_date.localeCompare(a.match_date))
  const displayName = sortedDesc[0].opponent_name ?? oppName

  const wins = ms.filter((m) => m.result === 'W').length
  const losses = ms.filter((m) => m.result === 'L').length
  const decided = wins + losses

  // Pick split
  const pickSplit = { ourPick: 0, theirPick: 0, decider: 0 }
  for (const m of ms) {
    if (m.pick === 'Our Pick') pickSplit.ourPick++
    else if (m.pick === 'Their Pick') pickSplit.theirPick++
    else if (m.pick === 'Decider') pickSplit.decider++
  }

  // Per-map record (THEIR PoV — flip our result)
  const mapAgg: Record<string, { total: number; oppWins: number; lastPlayed: string | null }> = {}
  for (const m of ms) {
    if (!m.map_name) continue
    const a = mapAgg[m.map_name] ?? { total: 0, oppWins: 0, lastPlayed: null }
    a.total++
    if (m.result === 'L') a.oppWins++
    if (!a.lastPlayed || m.match_date.localeCompare(a.lastPlayed) > 0) a.lastPlayed = m.match_date
    mapAgg[m.map_name] = a
  }
  const maps: DossierMap[] = Object.keys(mapAgg)
    .map((map) => {
      const a = mapAgg[map]
      return {
        map,
        total: a.total,
        oppWins: a.oppWins,
        oppLosses: a.total - a.oppWins,
        oppWinPct: pct(a.oppWins, a.total),
        lastPlayed: a.lastPlayed,
      }
    })
    .sort((a, b) => b.total - a.total || (b.oppWinPct ?? -1) - (a.oppWinPct ?? -1))

  // Their roster: group opp_players by riot_id_full (fallback to opp_player_name)
  const playerAgg: Record<
    string,
    {
      riotId: string | null
      name: string | null
      matches: Set<string>
      acsSum: number
      acsN: number
      agents: Record<string, number>
    }
  > = {}
  for (const op of ms_op) {
    const key = op.riot_id_full ?? op.opp_player_name ?? ''
    if (!key) continue
    const cur =
      playerAgg[key] ??
      {
        riotId: op.riot_id_full,
        name: op.opp_player_name,
        matches: new Set<string>(),
        acsSum: 0,
        acsN: 0,
        agents: {} as Record<string, number>,
      }
    cur.matches.add(op.match_id)
    if (op.acs != null) {
      cur.acsSum += op.acs
      cur.acsN++
    }
    if (op.agent) cur.agents[op.agent] = (cur.agents[op.agent] ?? 0) + 1
    playerAgg[key] = cur
  }
  const theirRoster: DossierPlayerStat[] = Object.values(playerAgg)
    .map((p) => ({
      riotIdFull: p.riotId,
      displayName: p.name,
      matches: p.matches.size,
      avgAcs: p.acsN > 0 ? Math.round(p.acsSum / p.acsN) : null,
      agents: Object.entries(p.agents)
        .map(([agent, count]) => ({ agent, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.matches - a.matches || (b.avgAcs ?? -1) - (a.avgAcs ?? -1))

  // Their top comps (full 5-agent stacks per match)
  const theirCompsAgg: Record<string, { agents: string[]; played: number; oppWins: number }> = {}
  for (const m of ms) {
    const stack = m.opp_agents && m.opp_agents.length > 0 ? m.opp_agents : null
    if (!stack) continue
    const sorted = [...stack].sort()
    const key = sorted.join(',')
    const cur = theirCompsAgg[key] ?? { agents: sorted, played: 0, oppWins: 0 }
    cur.played++
    if (m.result === 'L') cur.oppWins++
    theirCompsAgg[key] = cur
  }
  const theirTopComps: DossierComp[] = Object.values(theirCompsAgg)
    .map((c) => ({
      agents: c.agents,
      archetype: classifyArchetype(c.agents),
      played: c.played,
      oppWins: c.oppWins,
    }))
    .sort((a, b) => b.played - a.played)
    .slice(0, 5)

  // Tendencies: pistol oppWPct, plant rate, avg their ults
  let pistolOppW = 0
  let pistolN = 0
  let theirAttRounds = 0
  let theirPlants = 0
  let theirUltSum = 0
  let theirUltN = 0
  for (const r of ms_rounds) {
    // Pistol = round_type Pistol. Our outcome flipped = their outcome.
    if (r.round_type === 'Pistol' && r.outcome) {
      pistolN++
      if (r.outcome === 'L') pistolOppW++
    }
    // Their ATT rounds = we are defending. We don't have planter boolean reliably,
    // but plant_time_in_round is non-null only when ATT planted. Our PoV side=Defense ⇒ they ATT.
    if (r.side === 'Defense') {
      theirAttRounds++
      if (r.plant_time_in_round != null) theirPlants++
    }
    if (r.their_ults_used != null) {
      theirUltSum += r.their_ults_used
      theirUltN++
    }
  }
  const tendencies: DossierTendencies = {
    pistolOppWPct: pct(pistolOppW, pistolN),
    pistolN,
    plantRate: pct(theirPlants, theirAttRounds),
    plantN: theirAttRounds,
    avgTheirUlts:
      theirUltN > 0 ? Math.round((theirUltSum / theirUltN) * 100) / 100 : null,
    ultN: theirUltN,
  }

  // S26 — deep tendency mining
  const matchToMapLookup: Record<string, string | null> = {}
  for (const m of ms) matchToMapLookup[m.id] = m.map_name
  const deepTendencies: DossierDeepTendencies = {
    setupsByRound: computeOppSetupsByRound(ms_rounds),
    execTimingByMap: computeOppExecuteTiming(ms_rounds, matchToMapLookup),
    siteByHalf: computeOppSiteByHalf(ms_rounds, matchToMapLookup),
  }

  // What works for us: our comps + win rate vs this opp
  const ourCompsAgg: Record<string, { agents: string[]; played: number; ourWins: number }> = {}
  for (const m of ms) {
    const stack = m.our_agents && m.our_agents.length > 0 ? m.our_agents : null
    if (!stack) continue
    const sorted = [...stack].sort()
    const key = sorted.join(',')
    const cur = ourCompsAgg[key] ?? { agents: sorted, played: 0, ourWins: 0 }
    cur.played++
    if (m.result === 'W') cur.ourWins++
    ourCompsAgg[key] = cur
  }
  const ourBestComps: DossierOurComp[] = Object.values(ourCompsAgg)
    .map((c) => ({
      agents: c.agents,
      archetype: classifyArchetype(c.agents),
      played: c.played,
      ourWins: c.ourWins,
      ourWinPct: pct(c.ourWins, c.played),
    }))
    .sort(
      (a, b) =>
        (b.ourWinPct ?? -1) - (a.ourWinPct ?? -1) ||
        b.played - a.played
    )
    .slice(0, 5)

  // Top fragger vs this opp: highest avg ACS across these matches
  const playerAcsAgg: Record<string, { name: string; sum: number; n: number }> = {}
  for (const mp of ms_mp) {
    if (mp.acs == null || !mp.display_name) continue
    const cur = playerAcsAgg[mp.player_id] ?? { name: mp.display_name, sum: 0, n: 0 }
    cur.sum += mp.acs
    cur.n++
    playerAcsAgg[mp.player_id] = cur
  }
  let ourTopFragger: OpponentDossier['ourTopFragger'] = null
  for (const v of Object.values(playerAcsAgg)) {
    const avg = v.sum / v.n
    if (!ourTopFragger || avg > ourTopFragger.avgAcs) {
      ourTopFragger = { name: v.name, avgAcs: Math.round(avg) }
    }
  }

  // Our site conversions vs this opp: side=Attack rounds with site set
  const matchIdToMap: Record<string, string | null> = {}
  for (const m of ms) matchIdToMap[m.id] = m.map_name
  const siteAgg: Record<string, { map: string; site: 'A' | 'B' | 'C'; total: number; wins: number }> = {}
  for (const r of ms_rounds) {
    if (r.side !== 'Attack' || !r.site || !r.outcome) continue
    if (r.site !== 'A' && r.site !== 'B' && r.site !== 'C') continue
    const map = matchIdToMap[r.match_id]
    if (!map) continue
    const key = `${map}|${r.site}`
    const cur = siteAgg[key] ?? { map, site: r.site, total: 0, wins: 0 }
    cur.total++
    if (r.outcome === 'W') cur.wins++
    siteAgg[key] = cur
  }
  const ourSiteConversions: DossierSite[] = Object.values(siteAgg)
    .map((s) => ({
      map: s.map,
      site: s.site,
      ourWins: s.wins,
      total: s.total,
      ourWinPct: pct(s.wins, s.total),
    }))
    .sort(
      (a, b) =>
        (b.ourWinPct ?? -1) - (a.ourWinPct ?? -1) || b.total - a.total
    )
    .slice(0, 8)

  return {
    name: displayName,
    played: ms.length,
    wins,
    losses,
    winPct: pct(wins, decided),
    lastMet: sortedDesc[0].match_date,
    pickSplit,
    history: sortedDesc.map((m) => ({
      matchIdHelldock: m.match_id_helldock,
      date: m.match_date,
      map: m.map_name,
      ourScore: m.our_score,
      oppScore: m.opp_score,
      result: m.result,
    })),
    maps,
    theirRoster,
    theirTopComps,
    tendencies,
    deepTendencies,
    ourBestComps,
    ourTopFragger,
    ourSiteConversions,
  }
}
