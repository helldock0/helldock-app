import type { DashMatch, DashRound } from '@/lib/dashboard'
import { pct } from '@/lib/dashboard'
import { resolveWeaponName } from '@/lib/valorant-weapons'

// ── Type extensions for buried Henrik fields ─────────────────────────────────

export type GemsMatchPlayer = {
  match_id: string
  player_id: string | null
  player: { display_name: string } | null
  two_k?: number | null
  three_k?: number | null
  four_k?: number | null
  aces?: number | null
  clutches?: number | null
  clutch_1v2plus?: number | null
  damage_made?: number | null
  damage_received?: number | null
}

export type GemsRound = DashRound & {
  was_traded?: boolean | null
}

export type GemsKillEvent = {
  match_id: string
  round_num: number
  weapon_id: string | null
  killer_is_ours: boolean | null
  is_first_blood: boolean | null
}

// ── 1. Multi-kill leaderboard ────────────────────────────────────────────────

export type MultiKillLeader = {
  playerId: string
  name: string
  matches: number
  twoKPerGame: number
  threeKPerGame: number
  fourKPerGame: number
  acesTotal: number
}

export function computeMultiKillLeaders(
  matchPlayers: GemsMatchPlayer[]
): MultiKillLeader[] {
  type Agg = {
    name: string
    matches: number
    two: number
    three: number
    four: number
    aces: number
  }
  const agg: Record<string, Agg> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.player) continue
    const a =
      agg[mp.player_id] ??
      { name: mp.player.display_name, matches: 0, two: 0, three: 0, four: 0, aces: 0 }
    a.matches++
    a.two += mp.two_k ?? 0
    a.three += mp.three_k ?? 0
    a.four += mp.four_k ?? 0
    a.aces += mp.aces ?? 0
    agg[mp.player_id] = a
  }
  return Object.entries(agg)
    .map(([playerId, a]) => ({
      playerId,
      name: a.name,
      matches: a.matches,
      twoKPerGame: a.matches > 0 ? Math.round((a.two / a.matches) * 100) / 100 : 0,
      threeKPerGame:
        a.matches > 0 ? Math.round((a.three / a.matches) * 100) / 100 : 0,
      fourKPerGame: a.matches > 0 ? Math.round((a.four / a.matches) * 100) / 100 : 0,
      acesTotal: a.aces,
    }))
    .sort(
      (a, b) =>
        b.threeKPerGame - a.threeKPerGame || b.twoKPerGame - a.twoKPerGame
    )
}

// ── 2. High-leverage clutches ────────────────────────────────────────────────

export type ClutchLeader = {
  playerId: string
  name: string
  matches: number
  clutches: number
  highLeverageClutches: number // 1v2+
  clutchesPerGame: number
}

export function computeClutchLeverage(
  matchPlayers: GemsMatchPlayer[]
): ClutchLeader[] {
  type Agg = { name: string; matches: number; clutches: number; high: number }
  const agg: Record<string, Agg> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.player) continue
    const a =
      agg[mp.player_id] ?? { name: mp.player.display_name, matches: 0, clutches: 0, high: 0 }
    a.matches++
    a.clutches += mp.clutches ?? 0
    a.high += mp.clutch_1v2plus ?? 0
    agg[mp.player_id] = a
  }
  return Object.entries(agg)
    .map(([playerId, a]) => ({
      playerId,
      name: a.name,
      matches: a.matches,
      clutches: a.clutches,
      highLeverageClutches: a.high,
      clutchesPerGame:
        a.matches > 0 ? Math.round((a.clutches / a.matches) * 100) / 100 : 0,
    }))
    .sort(
      (a, b) =>
        b.highLeverageClutches - a.highLeverageClutches ||
        b.clutches - a.clutches
    )
}

// ── 3. Trade % (cohesion proxy) ──────────────────────────────────────────────

export type TradeStats = {
  ourTradedPct: number | null // when we died, % of those deaths that were traded
  tradedN: number
  perMap: { map: string; pct: number | null; n: number }[]
}

/**
 * `was_traded` is a boolean on `rounds` (per Henrik V4 transformer). It captures
 * whether the round's first death (the player who died first) was traded by a
 * teammate — a team-level cohesion signal, not per-player.
 *
 * Limitation: rounds.was_traded reflects ONE situation per round (typically the
 * first-blood swing). This is what Henrik exposes. The pct here = % of rounds
 * where we lost a man and got the trade vs we lost a man and didn't.
 */
export function computeTradePct(
  matches: DashMatch[],
  rounds: GemsRound[]
): TradeStats {
  // Only count rounds where WE died first (our first_blood = 'them'). On those
  // rounds, was_traded tells us whether we got the swap.
  const matchIdToMap: Record<string, string | null> = {}
  for (const m of matches) matchIdToMap[m.id] = m.map_name

  let traded = 0,
    n = 0
  const perMapAgg: Record<string, { traded: number; n: number }> = {}
  for (const r of rounds) {
    if (r.first_blood !== 'them') continue
    if (r.was_traded == null) continue
    n++
    if (r.was_traded) traded++
    const map = matchIdToMap[r.match_id]
    if (map) {
      const cur = perMapAgg[map] ?? { traded: 0, n: 0 }
      cur.n++
      if (r.was_traded) cur.traded++
      perMapAgg[map] = cur
    }
  }
  const perMap = Object.entries(perMapAgg)
    .map(([map, a]) => ({ map, pct: pct(a.traded, a.n), n: a.n }))
    .sort((a, b) => b.n - a.n)
  return { ourTradedPct: pct(traded, n), tradedN: n, perMap }
}

// ── 4. First-blood weapon meta ───────────────────────────────────────────────

export type FbWeaponStat = {
  weapon: string
  ourFb: number
  theirFb: number
  ourFbRoundWinPct: number | null // when we got first blood with this weapon, % of those rounds we won
}

export function computeFirstBloodWeapons(
  killEvents: GemsKillEvent[],
  rounds: GemsRound[]
): FbWeaponStat[] {
  // Round-outcome lookup
  const roundOutcome: Record<string, string | null> = {}
  for (const r of rounds) {
    roundOutcome[`${r.match_id}|${r.round_num}`] = r.outcome
  }

  type Agg = { ourFb: number; theirFb: number; ourFbWins: number }
  const agg: Record<string, Agg> = {}
  for (const e of killEvents) {
    if (!e.is_first_blood) continue
    const name = resolveWeaponName(e.weapon_id)
    const a = agg[name] ?? { ourFb: 0, theirFb: 0, ourFbWins: 0 }
    if (e.killer_is_ours) {
      a.ourFb++
      const outcome = roundOutcome[`${e.match_id}|${e.round_num}`]
      if (outcome === 'W') a.ourFbWins++
    } else {
      a.theirFb++
    }
    agg[name] = a
  }
  return Object.entries(agg)
    .map(([weapon, a]) => ({
      weapon,
      ourFb: a.ourFb,
      theirFb: a.theirFb,
      ourFbRoundWinPct: pct(a.ourFbWins, a.ourFb),
    }))
    .sort((a, b) => b.ourFb + b.theirFb - (a.ourFb + a.theirFb))
}

// ── 5. Damage net per player ─────────────────────────────────────────────────

export type DamageNetLeader = {
  playerId: string
  name: string
  matches: number
  avgMade: number | null
  avgReceived: number | null
  avgNet: number | null
}

export function computeDamageNet(
  matchPlayers: GemsMatchPlayer[]
): DamageNetLeader[] {
  type Agg = {
    name: string
    matches: number
    madeSum: number
    madeN: number
    recvSum: number
    recvN: number
  }
  const agg: Record<string, Agg> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.player) continue
    const a =
      agg[mp.player_id] ??
      { name: mp.player.display_name, matches: 0, madeSum: 0, madeN: 0, recvSum: 0, recvN: 0 }
    a.matches++
    if (mp.damage_made != null) {
      a.madeSum += mp.damage_made
      a.madeN++
    }
    if (mp.damage_received != null) {
      a.recvSum += mp.damage_received
      a.recvN++
    }
    agg[mp.player_id] = a
  }
  return Object.entries(agg)
    .map(([playerId, a]) => {
      const avgMade = a.madeN > 0 ? Math.round(a.madeSum / a.madeN) : null
      const avgReceived = a.recvN > 0 ? Math.round(a.recvSum / a.recvN) : null
      const avgNet =
        avgMade != null && avgReceived != null ? avgMade - avgReceived : null
      return {
        playerId,
        name: a.name,
        matches: a.matches,
        avgMade,
        avgReceived,
        avgNet,
      }
    })
    .sort((a, b) => (b.avgNet ?? -1) - (a.avgNet ?? -1))
}

// ── 6. Plant timing × outcome per map ────────────────────────────────────────

export type PlantTimingByMap = {
  map: string
  winMedianSec: number | null
  winN: number
  lossMedianSec: number | null
  lossN: number
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : Math.round(sorted[mid] * 10) / 10
}

export function computePlantTimingByMap(
  matches: DashMatch[],
  rounds: GemsRound[]
): PlantTimingByMap[] {
  const matchIdToMap: Record<string, string | null> = {}
  for (const m of matches) matchIdToMap[m.id] = m.map_name

  type Agg = { wins: number[]; losses: number[] }
  const byMap: Record<string, Agg> = {}
  for (const r of rounds) {
    // Plant timing only matters when WE planted = side=Attack with plant_time set
    if (r.side !== 'Attack' || r.plant_time_in_round == null) continue
    const map = matchIdToMap[r.match_id]
    if (!map) continue
    const a = byMap[map] ?? { wins: [], losses: [] }
    if (r.outcome === 'W') a.wins.push(r.plant_time_in_round)
    else if (r.outcome === 'L') a.losses.push(r.plant_time_in_round)
    byMap[map] = a
  }
  return Object.entries(byMap)
    .map(([map, a]) => ({
      map,
      winMedianSec: median(a.wins),
      winN: a.wins.length,
      lossMedianSec: median(a.losses),
      lossN: a.losses.length,
    }))
    .filter((r) => r.winN + r.lossN >= 3)
    .sort((a, b) => b.winN + b.lossN - (a.winN + a.lossN))
}
