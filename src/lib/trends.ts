import type { DashMatch, DashRound } from '@/lib/dashboard'
import { pct } from '@/lib/dashboard'

export type TrendsMatch = DashMatch & {
  match_type?: string | null
}

export type TrendsMatchPlayer = {
  match_id: string
  player_id: string
  acs: number | null
  player: { display_name: string } | null
}

// ── 1. Rolling win-rate curve ────────────────────────────────────────────────

export type RollingWinPoint = {
  date: string // ISO YYYY-MM-DD, end of the window
  overallPct: number | null
  overallN: number
  scrimPct: number | null
  scrimN: number
}

const NON_SCRIM_TYPES = new Set(['Practice', 'Internal Scrim'])

function isScrim(m: TrendsMatch): boolean {
  return !m.match_type || !NON_SCRIM_TYPES.has(m.match_type)
}

/**
 * For each match date, compute the win % over the trailing 30 days.
 * One point per match-date (de-duped + sorted asc). Both "overall" and "scrim-only"
 * series. Returns [] when there are no matches.
 */
export function computeRollingWinRate(
  matches: TrendsMatch[],
  windowDays = 30
): RollingWinPoint[] {
  if (matches.length === 0) return []

  const sorted = [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date))
  const dates = Array.from(new Set(sorted.map((m) => m.match_date)))

  const out: RollingWinPoint[] = []
  for (const d of dates) {
    const endMs = new Date(d + 'T23:59:59').getTime()
    const startMs = endMs - windowDays * 24 * 60 * 60 * 1000

    let oW = 0,
      oT = 0,
      sW = 0,
      sT = 0
    for (const m of sorted) {
      if (!m.result) continue
      const t = new Date(m.match_date + 'T12:00:00').getTime()
      if (t < startMs || t > endMs) continue
      if (m.result === 'W' || m.result === 'L') {
        oT++
        if (m.result === 'W') oW++
        if (isScrim(m)) {
          sT++
          if (m.result === 'W') sW++
        }
      }
    }
    out.push({
      date: d,
      overallPct: pct(oW, oT),
      overallN: oT,
      scrimPct: pct(sW, sT),
      scrimN: sT,
    })
  }
  return out
}

// ── 2. Weekly side bias drift ────────────────────────────────────────────────

export type WeeklySidePoint = {
  weekStart: string // YYYY-MM-DD (ISO week Monday)
  attPct: number | null
  defPct: number | null
  attN: number
  defN: number
}

function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  // Day 0 = Sunday → roll back to Monday (1)
  const day = d.getDay() || 7
  if (day !== 1) d.setDate(d.getDate() - (day - 1))
  return d.toISOString().split('T')[0]
}

export function computeWeeklySideBias(
  matches: TrendsMatch[],
  rounds: DashRound[],
  weeks = 12
): WeeklySidePoint[] {
  const matchIdToWeek: Record<string, string> = {}
  for (const m of matches) {
    matchIdToWeek[m.id] = isoWeekStart(m.match_date)
  }

  type Agg = { attW: number; attT: number; defW: number; defT: number }
  const byWeek: Record<string, Agg> = {}
  for (const r of rounds) {
    if (!r.side || !r.outcome) continue
    const week = matchIdToWeek[r.match_id]
    if (!week) continue
    const a = byWeek[week] ?? { attW: 0, attT: 0, defW: 0, defT: 0 }
    if (r.side === 'Attack') {
      a.attT++
      if (r.outcome === 'W') a.attW++
    } else if (r.side === 'Defense') {
      a.defT++
      if (r.outcome === 'W') a.defW++
    }
    byWeek[week] = a
  }

  const allWeeks = Object.keys(byWeek).sort()
  const tailWeeks = allWeeks.slice(Math.max(0, allWeeks.length - weeks))
  return tailWeeks.map((week) => {
    const a = byWeek[week]
    return {
      weekStart: week,
      attPct: pct(a.attW, a.attT),
      defPct: pct(a.defW, a.defT),
      attN: a.attT,
      defN: a.defT,
    }
  })
}

// ── 3. Per-player ACS trajectory ─────────────────────────────────────────────

export type PlayerAcsBucket = { date: string; avgAcs: number; gamesInBucket: number }
export type PlayerAcsTrend = {
  playerId: string
  name: string
  buckets: PlayerAcsBucket[]
  trend: 'improving' | 'declining' | 'stable'
  trendDelta: number | null // (last-bucket avg) - (overall avg)
  allTimeAvg: number | null
}

/**
 * For each player, ACS averaged in `bucketSize`-match rolling buckets.
 * Auto-flags trend: last bucket vs overall avg.
 */
export function computePlayerAcsBuckets(
  matches: TrendsMatch[],
  matchPlayers: TrendsMatchPlayer[],
  bucketSize = 5
): PlayerAcsTrend[] {
  // Build chronological match list
  const matchOrder: Record<string, string> = {}
  const sortedMatches = [...matches].sort((a, b) =>
    a.match_date.localeCompare(b.match_date)
  )
  for (const m of sortedMatches) matchOrder[m.id] = m.match_date

  // Group player perf by player_id, sorted by match_date asc
  type Row = { date: string; acs: number; name: string }
  const byPlayer: Record<string, Row[]> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || mp.acs == null || !mp.player) continue
    const date = matchOrder[mp.match_id]
    if (!date) continue
    byPlayer[mp.player_id] = byPlayer[mp.player_id] ?? []
    byPlayer[mp.player_id].push({ date, acs: mp.acs, name: mp.player.display_name })
  }

  const out: PlayerAcsTrend[] = []
  for (const playerId of Object.keys(byPlayer)) {
    const rows = byPlayer[playerId].sort((a, b) => a.date.localeCompare(b.date))
    if (rows.length === 0) continue

    const buckets: PlayerAcsBucket[] = []
    for (let i = 0; i < rows.length; i += bucketSize) {
      const chunk = rows.slice(i, i + bucketSize)
      const sum = chunk.reduce((s, r) => s + r.acs, 0)
      buckets.push({
        date: chunk[chunk.length - 1].date,
        avgAcs: Math.round(sum / chunk.length),
        gamesInBucket: chunk.length,
      })
    }

    const allTimeAvg = Math.round(
      rows.reduce((s, r) => s + r.acs, 0) / rows.length
    )
    const lastBucket = buckets[buckets.length - 1]
    const trendDelta = lastBucket
      ? Math.round(((lastBucket.avgAcs - allTimeAvg) / allTimeAvg) * 1000) / 10
      : null
    let trend: PlayerAcsTrend['trend'] = 'stable'
    if (trendDelta != null) {
      if (trendDelta > 10) trend = 'improving'
      else if (trendDelta < -10) trend = 'declining'
    }

    out.push({
      playerId,
      name: rows[0].name,
      buckets,
      trend,
      trendDelta,
      allTimeAvg,
    })
  }

  return out.sort((a, b) => (b.allTimeAvg ?? 0) - (a.allTimeAvg ?? 0))
}

// ── 4. Streaks ───────────────────────────────────────────────────────────────

export type Streaks = {
  current: { kind: 'W' | 'L' | 'none'; length: number }
  longestWin: number
  longestLoss: number
}

export function computeStreaks(matches: TrendsMatch[]): Streaks {
  const sorted = [...matches]
    .filter((m) => m.result === 'W' || m.result === 'L')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))

  let longestWin = 0
  let longestLoss = 0
  let runKind: 'W' | 'L' | null = null
  let runLen = 0
  for (const m of sorted) {
    const r = m.result as 'W' | 'L'
    if (r === runKind) {
      runLen++
    } else {
      runKind = r
      runLen = 1
    }
    if (r === 'W' && runLen > longestWin) longestWin = runLen
    if (r === 'L' && runLen > longestLoss) longestLoss = runLen
  }

  const last = sorted[sorted.length - 1]
  if (!last) return { current: { kind: 'none', length: 0 }, longestWin, longestLoss }

  // Walk back from the end to find current streak length
  let current = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].result === last.result) current++
    else break
  }
  return {
    current: { kind: last.result as 'W' | 'L', length: current },
    longestWin,
    longestLoss,
  }
}

// ── 5. Weekly retro (last 7d vs prior 7d) ─────────────────────────────────────

export type WeeklyRetro = {
  current: WeekWindow
  prior: WeekWindow
  delta: {
    matches: number
    winPct: number | null
    attPct: number | null
    defPct: number | null
    topFraggerAcs: number | null
  }
}
type WeekWindow = {
  matches: number
  wins: number
  losses: number
  winPct: number | null
  attPct: number | null
  attN: number
  defPct: number | null
  defN: number
  topFragger: { name: string; avgAcs: number } | null
}

function buildWindow(
  matches: TrendsMatch[],
  rounds: DashRound[],
  matchPlayers: TrendsMatchPlayer[],
  startMs: number,
  endMs: number
): WeekWindow {
  const inWindow = matches.filter((m) => {
    const t = new Date(m.match_date + 'T12:00:00').getTime()
    return t >= startMs && t <= endMs
  })
  const ids = new Set(inWindow.map((m) => m.id))

  const wins = inWindow.filter((m) => m.result === 'W').length
  const losses = inWindow.filter((m) => m.result === 'L').length

  let attW = 0,
    attT = 0,
    defW = 0,
    defT = 0
  for (const r of rounds) {
    if (!ids.has(r.match_id) || !r.side || !r.outcome) continue
    if (r.side === 'Attack') {
      attT++
      if (r.outcome === 'W') attW++
    } else if (r.side === 'Defense') {
      defT++
      if (r.outcome === 'W') defW++
    }
  }

  // Top fragger in this window
  const acsAgg: Record<string, { name: string; sum: number; n: number }> = {}
  for (const mp of matchPlayers) {
    if (!ids.has(mp.match_id) || mp.acs == null || !mp.player || !mp.player_id) continue
    const cur = acsAgg[mp.player_id] ?? { name: mp.player.display_name, sum: 0, n: 0 }
    cur.sum += mp.acs
    cur.n++
    acsAgg[mp.player_id] = cur
  }
  let topFragger: WeekWindow['topFragger'] = null
  for (const v of Object.values(acsAgg)) {
    if (v.n === 0) continue
    const avg = Math.round(v.sum / v.n)
    if (!topFragger || avg > topFragger.avgAcs) topFragger = { name: v.name, avgAcs: avg }
  }

  return {
    matches: inWindow.length,
    wins,
    losses,
    winPct: pct(wins, wins + losses),
    attPct: pct(attW, attT),
    attN: attT,
    defPct: pct(defW, defT),
    defN: defT,
    topFragger,
  }
}

export function computeWeeklyRetro(
  matches: TrendsMatch[],
  rounds: DashRound[],
  matchPlayers: TrendsMatchPlayer[]
): WeeklyRetro {
  const now = Date.now()
  const week = 7 * 24 * 60 * 60 * 1000
  const current = buildWindow(matches, rounds, matchPlayers, now - week, now)
  const prior = buildWindow(matches, rounds, matchPlayers, now - 2 * week, now - week)

  function delta(a: number | null, b: number | null): number | null {
    if (a == null || b == null) return null
    return Math.round((a - b) * 10) / 10
  }

  return {
    current,
    prior,
    delta: {
      matches: current.matches - prior.matches,
      winPct: delta(current.winPct, prior.winPct),
      attPct: delta(current.attPct, prior.attPct),
      defPct: delta(current.defPct, prior.defPct),
      topFraggerAcs:
        current.topFragger != null && prior.topFragger != null
          ? current.topFragger.avgAcs - prior.topFragger.avgAcs
          : null,
    },
  }
}
