export type DashMatch = {
  id: string
  match_id_helldock: string
  match_date: string
  opponent_name: string | null
  map_name: string | null
  our_score: number | null
  opp_score: number | null
  result: string | null
  our_agents: string[] | null
}

export type DashRound = {
  match_id: string
  round_num: number
  half: string | null
  side: string | null
  round_type: string | null
  outcome: string | null
  first_blood: string | null
  clutch_type: string | null
  clutch_player: string | null
  site: string | null
  // V4 additions (optional — older rounds may not have these)
  plant_time_in_round?: number | null
  defuse_time_in_round?: number | null
}

export type DashMatchPlayer = {
  match_id: string
  player_id: string | null
  acs: number | null
  player: { display_name: string } | null
}

export const MIN_GAMES_FOR_MAP_RANK = 2

function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function isWithinDays(dateStr: string, n: number): boolean {
  const matchDate = new Date(dateStr + 'T00:00:00')
  const cutoff = todayMidnight()
  cutoff.setDate(cutoff.getDate() - n)
  return matchDate >= cutoff
}

export function pct(num: number, den: number): number | null {
  if (den === 0) return null
  return Math.round((num / den) * 1000) / 10
}

export function mapWinStats(matches: DashMatch[]): Record<string, { wins: number; total: number }> {
  const counts: Record<string, { wins: number; total: number }> = {}
  for (const m of matches) {
    if (!m.map_name || !m.result) continue
    const cur = counts[m.map_name] ?? { wins: 0, total: 0 }
    cur.total++
    if (m.result === 'W') cur.wins++
    counts[m.map_name] = cur
  }
  return counts
}

// ── Zone 1: PULSE ───────────────────────────────────────────────────────────

export function computePulse(matches: DashMatch[]) {
  const totalScrims = matches.length
  const thisWeek = matches.filter((m) => isWithinDays(m.match_date, 7)).length
  const wins = matches.filter((m) => m.result === 'W').length
  const winRate = pct(wins, totalScrims)

  const sortedDesc = [...matches].sort((a, b) => b.match_date.localeCompare(a.match_date))
  let winStreak = 0
  for (const m of sortedDesc) {
    if (m.result === 'W') winStreak++
    else if (m.result === 'L') break
  }

  const last = sortedDesc[0] ?? null
  const lastMap = last
    ? {
        text: `${last.our_score ?? 0}-${last.opp_score ?? 0} ${last.result ?? '—'} vs ${last.opponent_name ?? '—'}`,
        matchId: last.match_id_helldock,
        mapName: last.map_name,
      }
    : null

  let mostPlayedMap: { map: string; count: number } | null = null
  const mapCounts: Record<string, number> = {}
  for (const m of matches) {
    if (!m.map_name) continue
    mapCounts[m.map_name] = (mapCounts[m.map_name] ?? 0) + 1
  }
  for (const map of Object.keys(mapCounts)) {
    const count = mapCounts[map]
    if (!mostPlayedMap || count > mostPlayedMap.count) mostPlayedMap = { map, count }
  }

  return { totalScrims, thisWeek, winRate, winStreak, lastMap, mostPlayedMap }
}

// ── Zone 2: WHAT'S BROKEN ───────────────────────────────────────────────────

export function computeBroken(matches: DashMatch[], rounds: DashRound[]) {
  const mapStats = mapWinStats(matches)
  let worstMap: { map: string; pct: number; wins: number; total: number } | null = null
  for (const map of Object.keys(mapStats)) {
    const s = mapStats[map]
    if (s.total < MIN_GAMES_FOR_MAP_RANK) continue
    const winPct = (s.wins / s.total) * 100
    if (!worstMap || winPct < worstMap.pct) {
      worstMap = { map, pct: Math.round(winPct * 10) / 10, wins: s.wins, total: s.total }
    }
  }

  const defRounds = rounds.filter((r) => r.side === 'Defense' && r.outcome)
  const defWins = defRounds.filter((r) => r.outcome === 'W').length
  const defPct = pct(defWins, defRounds.length)

  const matchDateById = new Map(matches.map((m) => [m.id, m.match_date]))
  const pistolDef = rounds
    .filter((r) => r.round_type === 'Pistol' && r.side === 'Defense' && r.outcome)
    .sort((a, b) => {
      const da = matchDateById.get(a.match_id) ?? ''
      const db = matchDateById.get(b.match_id) ?? ''
      if (da !== db) return db.localeCompare(da)
      return b.round_num - a.round_num
    })
  let pistolDefLStreak = 0
  for (const r of pistolDef) {
    if (r.outcome === 'L') pistolDefLStreak++
    else break
  }

  const oneVOneLosses = rounds.filter(
    (r) => r.clutch_type === '1v1' && r.outcome === 'L'
  ).length

  return { worstMap, defPct, defSample: defRounds.length, pistolDefLStreak, oneVOneLosses }
}

// ── Zone 3: WHAT'S WORKING ──────────────────────────────────────────────────

export function computeWorking(
  matches: DashMatch[],
  rounds: DashRound[],
  matchPlayers: DashMatchPlayer[]
) {
  const mapStats = mapWinStats(matches)
  let bestMap: { map: string; pct: number; wins: number; total: number } | null = null
  for (const map of Object.keys(mapStats)) {
    const s = mapStats[map]
    if (s.total < MIN_GAMES_FOR_MAP_RANK) continue
    const winPct = (s.wins / s.total) * 100
    if (!bestMap || winPct > bestMap.pct) {
      bestMap = { map, pct: Math.round(winPct * 10) / 10, wins: s.wins, total: s.total }
    }
  }

  const attRounds = rounds.filter((r) => r.side === 'Attack' && r.outcome)
  const attWins = attRounds.filter((r) => r.outcome === 'W').length
  const attPct = pct(attWins, attRounds.length)

  const recentMatchIds: Record<string, true> = {}
  for (const m of matches) {
    if (isWithinDays(m.match_date, 7)) recentMatchIds[m.id] = true
  }
  const byPlayer: Record<string, { name: string; totalAcs: number; n: number }> = {}
  for (const mp of matchPlayers) {
    if (!recentMatchIds[mp.match_id]) continue
    if (mp.acs == null || !mp.player_id || !mp.player) continue
    const cur = byPlayer[mp.player_id] ?? {
      name: mp.player.display_name,
      totalAcs: 0,
      n: 0,
    }
    cur.totalAcs += mp.acs
    cur.n++
    byPlayer[mp.player_id] = cur
  }
  let bestPlayer: { name: string; avgAcs: number; n: number } | null = null
  for (const id of Object.keys(byPlayer)) {
    const p = byPlayer[id]
    const avg = p.totalAcs / p.n
    if (!bestPlayer || avg > bestPlayer.avgAcs) {
      bestPlayer = { name: p.name, avgAcs: Math.round(avg * 10) / 10, n: p.n }
    }
  }

  const compStats: Record<string, { agents: string[]; wins: number; total: number }> = {}
  for (const m of matches) {
    if (!m.our_agents || m.our_agents.length === 0) continue
    const sorted = [...m.our_agents].sort()
    const key = sorted.join(',')
    const cur = compStats[key] ?? { agents: sorted, wins: 0, total: 0 }
    cur.total++
    if (m.result === 'W') cur.wins++
    compStats[key] = cur
  }
  let bestComp: { agents: string[]; wins: number; total: number } | null = null
  for (const key of Object.keys(compStats)) {
    const c = compStats[key]
    if (!bestComp || c.wins > bestComp.wins) bestComp = c
  }

  return { bestMap, attPct, attSample: attRounds.length, bestPlayer, bestComp }
}

// ── Zone 4: OPP INTEL ───────────────────────────────────────────────────────

export function computeOppIntel(matches: DashMatch[]) {
  const byOpp: Record<string, { wins: number; losses: number; total: number }> = {}
  for (const m of matches) {
    if (!m.opponent_name) continue
    const cur = byOpp[m.opponent_name] ?? { wins: 0, losses: 0, total: 0 }
    cur.total++
    if (m.result === 'W') cur.wins++
    else if (m.result === 'L') cur.losses++
    byOpp[m.opponent_name] = cur
  }
  return Object.keys(byOpp)
    .map((name) => ({ name, ...byOpp[name] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
}

// ── Zone 5: ENTRY STATS ─────────────────────────────────────────────────────

export function computeEntry(rounds: DashRound[]) {
  const usFB = rounds.filter((r) => r.first_blood === 'Us' && r.outcome)
  const usFBWins = usFB.filter((r) => r.outcome === 'W').length
  const fkConv = pct(usFBWins, usFB.length)

  const themFB = rounds.filter((r) => r.first_blood === 'Them' && r.outcome)
  const themFBWins = themFB.filter((r) => r.outcome === 'W').length
  const fdSurv = pct(themFBWins, themFB.length)

  return { fkConv, fkSample: usFB.length, fdSurv, fdSample: themFB.length }
}
