// Per-player aggregations that PlayerStat doesn't already cover (per-opponent
// and per-agent records). All inputs are slim shapes — server page wires them.

import type { DashMatch } from './dashboard'
import { pct } from './dashboard'

export type PlayerMatchRow = {
  match_id: string
  player_id: string | null
  agent: string | null
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
}

export type PerOppRecord = {
  opp: string
  played: number
  wins: number
  losses: number
  winPct: number | null
  avgAcs: number | null
}

export type PerAgentRecord = {
  agent: string
  played: number
  wins: number
  losses: number
  winPct: number | null
  avgAcs: number | null
}

export type MatchHistoryRow = {
  matchId: string                // helldock display id
  date: string | null
  opp: string | null
  map: string | null
  agent: string | null
  result: string | null
  ourScore: number | null
  oppScore: number | null
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
}

export function computePerOpponent(
  playerId: string,
  matches: DashMatch[],
  rows: PlayerMatchRow[]
): PerOppRecord[] {
  const byOpp: Record<string, { wins: number; losses: number; total: number; acsSum: number; acsN: number }> = {}
  const matchById: Record<string, DashMatch> = {}
  for (const m of matches) matchById[m.id] = m

  for (const r of rows) {
    if (r.player_id !== playerId) continue
    const m = matchById[r.match_id]
    if (!m?.opponent_name) continue
    const opp = m.opponent_name
    const cur = byOpp[opp] ?? { wins: 0, losses: 0, total: 0, acsSum: 0, acsN: 0 }
    cur.total++
    if (m.result === 'W') cur.wins++
    else if (m.result === 'L') cur.losses++
    if (r.acs != null) {
      cur.acsSum += r.acs
      cur.acsN++
    }
    byOpp[opp] = cur
  }
  return Object.keys(byOpp)
    .map((opp) => ({
      opp,
      played: byOpp[opp].total,
      wins: byOpp[opp].wins,
      losses: byOpp[opp].losses,
      winPct: pct(byOpp[opp].wins, byOpp[opp].total),
      avgAcs:
        byOpp[opp].acsN > 0
          ? Math.round(byOpp[opp].acsSum / byOpp[opp].acsN)
          : null,
    }))
    .sort((a, b) => b.played - a.played || (b.winPct ?? 0) - (a.winPct ?? 0))
}

export function computePerAgent(
  playerId: string,
  matches: DashMatch[],
  rows: PlayerMatchRow[]
): PerAgentRecord[] {
  const byAgent: Record<string, { wins: number; losses: number; total: number; acsSum: number; acsN: number }> = {}
  const resultById: Record<string, string | null> = {}
  for (const m of matches) resultById[m.id] = m.result

  for (const r of rows) {
    if (r.player_id !== playerId) continue
    if (!r.agent) continue
    const result = resultById[r.match_id] ?? null
    const cur = byAgent[r.agent] ?? { wins: 0, losses: 0, total: 0, acsSum: 0, acsN: 0 }
    cur.total++
    if (result === 'W') cur.wins++
    else if (result === 'L') cur.losses++
    if (r.acs != null) {
      cur.acsSum += r.acs
      cur.acsN++
    }
    byAgent[r.agent] = cur
  }
  return Object.keys(byAgent)
    .map((agent) => ({
      agent,
      played: byAgent[agent].total,
      wins: byAgent[agent].wins,
      losses: byAgent[agent].losses,
      winPct: pct(byAgent[agent].wins, byAgent[agent].total),
      avgAcs:
        byAgent[agent].acsN > 0
          ? Math.round(byAgent[agent].acsSum / byAgent[agent].acsN)
          : null,
    }))
    .sort((a, b) => b.played - a.played || (b.winPct ?? 0) - (a.winPct ?? 0))
}

export function computeMatchHistory(
  playerId: string,
  matches: DashMatch[],
  rows: PlayerMatchRow[]
): MatchHistoryRow[] {
  const matchById: Record<string, DashMatch> = {}
  for (const m of matches) matchById[m.id] = m

  const out: MatchHistoryRow[] = []
  for (const r of rows) {
    if (r.player_id !== playerId) continue
    const m = matchById[r.match_id]
    if (!m) continue
    out.push({
      matchId: m.match_id_helldock,
      date: m.match_date ?? null,
      opp: m.opponent_name ?? null,
      map: m.map_name ?? null,
      agent: r.agent,
      result: m.result,
      ourScore: m.our_score,
      oppScore: m.opp_score,
      acs: r.acs,
      k: r.k,
      d: r.d,
      a: r.a,
    })
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
