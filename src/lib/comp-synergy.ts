// Pair-wise comp synergy. For every PAIR of agents that ever played together
// on our team, compute their joint W%. Useful for spotting duos that
// over-/underperform the avg of their solo records (lift).
//
// Inputs: just DashMatch (needs our_agents + result). Self-contained, pure.

import type { DashMatch } from './dashboard'
import { pct } from './dashboard'

export type SynergyPair = {
  a: string                  // alphabetically first
  b: string                  // alphabetically second
  wins: number
  losses: number
  total: number
  winPct: number | null
  // Solo W% for each agent (across all their matches), used to compute lift.
  soloAWinPct: number | null
  soloBWinPct: number | null
  // pair W% − mean(soloA, soloB), in percentage points. Positive = duo
  // overperforms each player's solo baseline.
  liftPp: number | null
}

export type SynergyMatrix = {
  // Agents that appear in at least one match (with >0 games), sorted by
  // total appearances desc — drives row/col order in the grid.
  agents: string[]
  // Total appearance count per agent (for sizing).
  appearancesByAgent: Record<string, number>
  // Solo W% per agent.
  soloByAgent: Record<string, { wins: number; total: number; winPct: number | null }>
  // Pair grid. Both directions are populated for easier rendering: cells[a][b]
  // and cells[b][a] point to the same object.
  cells: Record<string, Record<string, SynergyPair>>
  // Flat list of all pairs sorted by total desc, n>=minSample only.
  pairs: SynergyPair[]
  minSample: number
}

const DEFAULT_MIN_SAMPLE = 3

export function computeCompSynergy(
  matches: DashMatch[],
  opts?: { minSample?: number }
): SynergyMatrix {
  const minSample = opts?.minSample ?? DEFAULT_MIN_SAMPLE

  // Aggregate solo + pair stats.
  type SoloAgg = { wins: number; total: number }
  type PairAgg = { a: string; b: string; wins: number; losses: number; total: number }
  const solo: Record<string, SoloAgg> = {}
  const pair: Record<string, PairAgg> = {}

  for (const m of matches) {
    if (!m.our_agents || m.our_agents.length === 0) continue
    if (m.result !== 'W' && m.result !== 'L') continue
    const won = m.result === 'W'

    // De-dupe + sort agents inside a match (defensive — usually 5 distinct).
    const agents = Array.from(new Set(m.our_agents)).sort()

    // Solo tallies.
    for (const ag of agents) {
      const cur = solo[ag] ?? { wins: 0, total: 0 }
      cur.total++
      if (won) cur.wins++
      solo[ag] = cur
    }

    // Pair tallies — all C(N,2) combinations.
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const key = `${agents[i]}|${agents[j]}`
        const cur = pair[key] ?? {
          a: agents[i],
          b: agents[j],
          wins: 0,
          losses: 0,
          total: 0,
        }
        cur.total++
        if (won) cur.wins++
        else cur.losses++
        pair[key] = cur
      }
    }
  }

  // Build solo lookup.
  const soloByAgent: SynergyMatrix['soloByAgent'] = {}
  for (const ag of Object.keys(solo)) {
    soloByAgent[ag] = {
      wins: solo[ag].wins,
      total: solo[ag].total,
      winPct: pct(solo[ag].wins, solo[ag].total),
    }
  }

  // Build pair records with lift.
  const allPairs: SynergyPair[] = Object.values(pair).map((p) => {
    const soloA = soloByAgent[p.a]?.winPct ?? null
    const soloB = soloByAgent[p.b]?.winPct ?? null
    const pairWP = pct(p.wins, p.total)
    let lift: number | null = null
    if (pairWP != null && soloA != null && soloB != null) {
      lift = Math.round((pairWP - (soloA + soloB) / 2) * 10) / 10
    }
    return {
      a: p.a,
      b: p.b,
      wins: p.wins,
      losses: p.losses,
      total: p.total,
      winPct: pairWP,
      soloAWinPct: soloA,
      soloBWinPct: soloB,
      liftPp: lift,
    }
  })

  // Grid lookup (both directions).
  const cells: Record<string, Record<string, SynergyPair>> = {}
  for (const sp of allPairs) {
    cells[sp.a] = cells[sp.a] ?? {}
    cells[sp.b] = cells[sp.b] ?? {}
    cells[sp.a][sp.b] = sp
    cells[sp.b][sp.a] = sp
  }

  // Agents sorted by appearance count desc.
  const appearancesByAgent: Record<string, number> = {}
  for (const ag of Object.keys(soloByAgent)) {
    appearancesByAgent[ag] = soloByAgent[ag].total
  }
  const agents = Object.keys(appearancesByAgent).sort(
    (x, y) => appearancesByAgent[y] - appearancesByAgent[x] || x.localeCompare(y)
  )

  const pairs = allPairs
    .filter((p) => p.total >= minSample)
    .sort((x, y) => y.total - x.total || (y.winPct ?? -1) - (x.winPct ?? -1))

  return { agents, appearancesByAgent, soloByAgent, cells, pairs, minSample }
}
