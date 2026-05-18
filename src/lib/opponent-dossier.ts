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
  ourBestComps: DossierOurComp[]
  ourTopFragger: { name: string; avgAcs: number } | null
  ourSiteConversions: DossierSite[]
}

/** Case-insensitive equality on trimmed opponent names. */
export function normalizeOpponentName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
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
    ourBestComps,
    ourTopFragger,
    ourSiteConversions,
  }
}
