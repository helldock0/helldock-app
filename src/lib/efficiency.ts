// S26 — Util/econ efficiency compute. Pure functions, no DB calls.
// Builds on round_player_stats (per-round per-player) + match_players
// (match-wide ability_c/q/e/x — V4 does not expose these per-round) +
// rounds (for round_type buckets eco/anti-eco/bonus/full buy).

import { pct } from '@/lib/dashboard'

// ── Input types ──────────────────────────────────────────────────────────────

export type RpsRow = {
  match_id: string
  round_num: number
  puuid: string
  is_ours: boolean
  k: number
  d: number
  damage_made: number | null
  econ_spent: number
  ability_x_cast: number | null
}

export type EffMatchPlayer = {
  match_id: string
  player_id: string | null
  puuid: string | null
  player: { display_name: string } | null
  k: number | null
  damage_made: number | null
  ability_c: number | null
  ability_q: number | null
  ability_e: number | null
  ability_x: number | null
}

export type EffRound = {
  match_id: string
  round_num: number
  round_type: string | null    // 'Pistol' | 'Eco' | 'Anti-Eco' | 'Bonus' | 'Full Buy'
  outcome: string | null       // 'W' | 'L'
}

// ── Output types ─────────────────────────────────────────────────────────────

export type PlayerEfficiency = {
  playerId: string | null
  puuid: string
  name: string

  // Util budget (match-wide; per-round c/q/e is unavailable from V4)
  abilityCasts: number | null       // c + q + e + x
  utilPerKill: number | null
  utilPer100Dmg: number | null      // casts / (damage / 100)
  killsPerUtilCast: number | null
  ultsUsed: number | null           // ability_x match-wide
  ultKillsProxy: number             // sum of rps.ability_x_cast (lower-bound)

  // Per-round damage
  avgDamagePerRound: number | null
  topRoundDamage: number            // single best round damage
  topRoundNum: number | null
  damageLeaderRounds: number        // # rounds this player led OUR team in damage

  // Eco discipline
  ecoRoundCount: number             // rounds team was on Eco or Anti-Eco
  ecoSurvivedCount: number          // those rounds where player did NOT die
  ecoSavePct: number | null
  bonusRoundCount: number           // rounds team was on Bonus (force/mixed-buy)
  bonusWinCount: number
  bonusWinPct: number | null
  avgEconSpent: number              // overall avg loadout_value per round
}

export type DeltaMap = {
  utilPerKill: number | null
  utilPer100Dmg: number | null
  killsPerUtilCast: number | null
  avgDamagePerRound: number | null
  ecoSavePct: number | null
  ultsUsed: number | null
  ultKillsProxy: number | null
}

export type PlayerEfficiencyWithDelta = PlayerEfficiency & { delta: DeltaMap }

export type TeamAverages = {
  abilityCasts: number | null
  utilPerKill: number | null
  utilPer100Dmg: number | null
  killsPerUtilCast: number | null
  avgDamagePerRound: number | null
  ecoSavePct: number | null
  ultsUsed: number | null
  ultKillsProxy: number | null
}

export type RoundDamageLeader = {
  round_num: number
  outcome: string | null
  round_type: string | null
  leader: { puuid: string; name: string; damage: number } | null
  ranked: { puuid: string; name: string; damage: number }[]   // top→bottom on our side
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  return num / den
}

function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

function round2(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// ── Main compute ─────────────────────────────────────────────────────────────

/**
 * Per-player util + damage + eco efficiency for a single match.
 *
 * - Util casts are MATCH-WIDE (V4 hides per-round c/q/e). We expose
 *   `ultKillsProxy` (sum of rps.ability_x_cast) as a per-round-traceable
 *   lower-bound on ult usage.
 * - Damage rolls up from per-round rps.damage_made (sum/count → avg).
 * - Eco discipline counts ONLY rounds where the team's round_type was
 *   'Eco' or 'Anti-Eco' (low-econ defenses). 'Survived' = player.d == 0
 *   that round.
 *
 * Returns one row per OUR player who has at least one rps row in this match.
 * Opp players are intentionally skipped (this is a coaching tool, not a
 * scouting tool — different surface).
 */
export function computeMatchEfficiency(
  rps: RpsRow[],
  matchPlayers: EffMatchPlayer[],
  rounds: EffRound[]
): PlayerEfficiency[] {
  // Index match_players by puuid for ours-only filtering + name lookup.
  type MpInfo = {
    playerId: string | null
    name: string
    casts: number | null
    matchK: number | null
    matchDmg: number | null
    ultsUsed: number | null
  }
  const ourMpByPuuid: Record<string, MpInfo> = {}
  for (const mp of matchPlayers) {
    if (!mp.puuid) continue
    const casts =
      mp.ability_c != null || mp.ability_q != null || mp.ability_e != null || mp.ability_x != null
        ? (mp.ability_c ?? 0) + (mp.ability_q ?? 0) + (mp.ability_e ?? 0) + (mp.ability_x ?? 0)
        : null
    ourMpByPuuid[mp.puuid] = {
      playerId: mp.player_id,
      name: mp.player?.display_name ?? '—',
      casts,
      matchK: mp.k,
      matchDmg: mp.damage_made,
      ultsUsed: mp.ability_x,
    }
  }

  // Round_type lookup keyed by round_num.
  const roundTypeByNum: Record<number, string | null> = {}
  for (const r of rounds) roundTypeByNum[r.round_num] = r.round_type

  // Aggregate per-puuid per-round data ONLY for our players (skip opp).
  type Agg = {
    rpsRounds: number
    sumDamage: number
    sumDamageRounds: number  // rounds with non-null damage
    topRoundDamage: number
    topRoundNum: number | null
    sumEcon: number
    sumUltProxy: number
    ecoRoundCount: number
    ecoSurvived: number
    bonusRoundCount: number
    bonusWinCount: number
  }
  const aggByPuuid: Record<string, Agg> = {}

  // Damage-leader bookkeeping: for each round, track top-damage puuid on our side.
  type RoundLeader = { puuid: string; damage: number }
  const leaderByRound: Record<number, RoundLeader> = {}

  for (const r of rps) {
    if (!r.is_ours) continue
    if (!ourMpByPuuid[r.puuid]) continue  // unknown roster

    const a =
      aggByPuuid[r.puuid] ??
      {
        rpsRounds: 0,
        sumDamage: 0,
        sumDamageRounds: 0,
        topRoundDamage: 0,
        topRoundNum: null,
        sumEcon: 0,
        sumUltProxy: 0,
        ecoRoundCount: 0,
        ecoSurvived: 0,
        bonusRoundCount: 0,
        bonusWinCount: 0,
      }
    a.rpsRounds++
    if (r.damage_made != null) {
      a.sumDamage += r.damage_made
      a.sumDamageRounds++
      if (r.damage_made > a.topRoundDamage) {
        a.topRoundDamage = r.damage_made
        a.topRoundNum = r.round_num
      }
    }
    a.sumEcon += r.econ_spent
    a.sumUltProxy += r.ability_x_cast ?? 0

    const roundType = roundTypeByNum[r.round_num]
    if (roundType === 'Eco' || roundType === 'Anti-Eco') {
      a.ecoRoundCount++
      if (r.d === 0) a.ecoSurvived++
    } else if (roundType === 'Bonus') {
      a.bonusRoundCount++
      const outcome = rounds.find((rd) => rd.round_num === r.round_num)?.outcome
      if (outcome === 'W') a.bonusWinCount++
    }

    aggByPuuid[r.puuid] = a

    // Damage-leader scan
    if (r.damage_made != null) {
      const cur = leaderByRound[r.round_num]
      if (!cur || r.damage_made > cur.damage) {
        leaderByRound[r.round_num] = { puuid: r.puuid, damage: r.damage_made }
      }
    }
  }

  // Count damage-leader rounds per puuid.
  const leaderCountByPuuid: Record<string, number> = {}
  for (const k of Object.keys(leaderByRound)) {
    const lead = leaderByRound[Number(k)]
    leaderCountByPuuid[lead.puuid] = (leaderCountByPuuid[lead.puuid] ?? 0) + 1
  }

  // Materialize one PlayerEfficiency per OUR puuid present in rps.
  const out: PlayerEfficiency[] = []
  for (const puuid of Object.keys(aggByPuuid)) {
    const a = aggByPuuid[puuid]
    const mp = ourMpByPuuid[puuid]
    const casts = mp.casts

    const utilPerKill =
      casts != null && mp.matchK != null && mp.matchK > 0
        ? round2(safeDiv(casts, mp.matchK))
        : null
    const utilPer100Dmg =
      casts != null && mp.matchDmg != null && mp.matchDmg > 0
        ? round2(safeDiv(casts, mp.matchDmg / 100))
        : null
    const killsPerUtilCast =
      casts != null && casts > 0 && mp.matchK != null
        ? round2(safeDiv(mp.matchK, casts))
        : null
    const avgDamagePerRound =
      a.sumDamageRounds > 0 ? round1(a.sumDamage / a.sumDamageRounds) : null
    const ecoSavePct = pct(a.ecoSurvived, a.ecoRoundCount)
    const bonusWinPct = pct(a.bonusWinCount, a.bonusRoundCount)
    const avgEconSpent = a.rpsRounds > 0 ? Math.round(a.sumEcon / a.rpsRounds) : 0

    out.push({
      playerId: mp.playerId,
      puuid,
      name: mp.name,
      abilityCasts: casts,
      utilPerKill,
      utilPer100Dmg,
      killsPerUtilCast,
      ultsUsed: mp.ultsUsed,
      ultKillsProxy: a.sumUltProxy,
      avgDamagePerRound,
      topRoundDamage: a.topRoundDamage,
      topRoundNum: a.topRoundNum,
      damageLeaderRounds: leaderCountByPuuid[puuid] ?? 0,
      ecoRoundCount: a.ecoRoundCount,
      ecoSurvivedCount: a.ecoSurvived,
      ecoSavePct,
      bonusRoundCount: a.bonusRoundCount,
      bonusWinCount: a.bonusWinCount,
      bonusWinPct,
      avgEconSpent,
    })
  }

  // Stable sort: damage descending for default display.
  out.sort((a, b) => (b.avgDamagePerRound ?? -1) - (a.avgDamagePerRound ?? -1))
  return out
}

// Team avg over players. Skips null / non-finite values per-metric.
export function computeTeamAverages(players: PlayerEfficiency[]): TeamAverages {
  function avg(nums: (number | null)[]): number | null {
    const vals = nums.filter((n): n is number => n != null && Number.isFinite(n))
    if (!vals.length) return null
    return round2(vals.reduce((s, v) => s + v, 0) / vals.length)
  }
  return {
    abilityCasts: avg(players.map((p) => p.abilityCasts)),
    utilPerKill: avg(players.map((p) => p.utilPerKill)),
    utilPer100Dmg: avg(players.map((p) => p.utilPer100Dmg)),
    killsPerUtilCast: avg(players.map((p) => p.killsPerUtilCast)),
    avgDamagePerRound: avg(players.map((p) => p.avgDamagePerRound)),
    ecoSavePct: avg(players.map((p) => p.ecoSavePct)),
    ultsUsed: avg(players.map((p) => p.ultsUsed)),
    ultKillsProxy: avg(players.map((p) => p.ultKillsProxy)),
  }
}

export function withTeamDeltas(
  players: PlayerEfficiency[],
  team: TeamAverages
): PlayerEfficiencyWithDelta[] {
  function d(value: number | null, base: number | null): number | null {
    if (value == null || base == null) return null
    return round2(value - base)
  }
  return players.map((p) => ({
    ...p,
    delta: {
      utilPerKill: d(p.utilPerKill, team.utilPerKill),
      utilPer100Dmg: d(p.utilPer100Dmg, team.utilPer100Dmg),
      killsPerUtilCast: d(p.killsPerUtilCast, team.killsPerUtilCast),
      avgDamagePerRound: d(p.avgDamagePerRound, team.avgDamagePerRound),
      ecoSavePct: d(p.ecoSavePct, team.ecoSavePct),
      ultsUsed: d(p.ultsUsed, team.ultsUsed),
      ultKillsProxy: d(p.ultKillsProxy, team.ultKillsProxy),
    },
  }))
}

/**
 * Per-round breakdown of our team's damage. One row per round with the leader
 * + ranked list (descending). Used by the post-scrim report's round table.
 */
export function computeRoundDamageLeaders(
  rps: RpsRow[],
  matchPlayers: EffMatchPlayer[],
  rounds: EffRound[]
): RoundDamageLeader[] {
  const nameByPuuid: Record<string, string> = {}
  for (const mp of matchPlayers) {
    if (mp.puuid && mp.player) nameByPuuid[mp.puuid] = mp.player.display_name
  }

  const byRound: Record<number, { puuid: string; name: string; damage: number }[]> = {}
  for (const r of rps) {
    if (!r.is_ours) continue
    if (r.damage_made == null) continue
    byRound[r.round_num] = byRound[r.round_num] ?? []
    byRound[r.round_num].push({
      puuid: r.puuid,
      name: nameByPuuid[r.puuid] ?? r.puuid.slice(0, 6),
      damage: r.damage_made,
    })
  }

  return rounds
    .map((rd) => {
      const ranked = (byRound[rd.round_num] ?? []).sort(
        (a, b) => b.damage - a.damage
      )
      return {
        round_num: rd.round_num,
        outcome: rd.outcome,
        round_type: rd.round_type,
        leader: ranked[0] ?? null,
        ranked,
      }
    })
    .sort((a, b) => a.round_num - b.round_num)
}

// ── Coaching-talking-point summary (used by /prep audit section) ────────────

export type AuditFinding = {
  kind: 'over' | 'under'
  metric: string
  player: string
  delta: number
  note: string
}

/**
 * Surface the top 3 off-average coaching points: largest absolute deltas vs
 * team avg on util-per-kill (under-using = good, over-using = bad in a vacuum,
 * but coach reads context). Plus eco save% spread. Plus damage-per-round.
 * Returns at most 4 items.
 */
export function computeAuditFindings(
  players: PlayerEfficiencyWithDelta[]
): AuditFinding[] {
  if (!players.length) return []

  const findings: AuditFinding[] = []
  // 1. Most over-util (highest utilPerKill delta — burns util without converting)
  const overUtil = [...players]
    .filter((p) => p.delta.utilPerKill != null && p.delta.utilPerKill > 0)
    .sort((a, b) => (b.delta.utilPerKill ?? 0) - (a.delta.utilPerKill ?? 0))[0]
  if (overUtil && overUtil.delta.utilPerKill != null && overUtil.delta.utilPerKill >= 0.5) {
    findings.push({
      kind: 'over',
      metric: 'util/kill',
      player: overUtil.name,
      delta: overUtil.delta.utilPerKill,
      note: `+${overUtil.delta.utilPerKill.toFixed(2)} util/kill vs team avg — burning util without conversion`,
    })
  }
  // 2. Most under-util (most efficient — call out the positive)
  const underUtil = [...players]
    .filter((p) => p.delta.utilPerKill != null && p.delta.utilPerKill < 0)
    .sort((a, b) => (a.delta.utilPerKill ?? 0) - (b.delta.utilPerKill ?? 0))[0]
  if (underUtil && underUtil.delta.utilPerKill != null && underUtil.delta.utilPerKill <= -0.5) {
    findings.push({
      kind: 'under',
      metric: 'util/kill',
      player: underUtil.name,
      delta: underUtil.delta.utilPerKill,
      note: `${underUtil.delta.utilPerKill.toFixed(2)} util/kill vs team avg — most efficient utility usage`,
    })
  }
  // 3. Worst eco save% (smallest negative delta below team avg)
  const worstEco = [...players]
    .filter((p) => p.delta.ecoSavePct != null && p.delta.ecoSavePct < 0 && p.ecoRoundCount >= 2)
    .sort((a, b) => (a.delta.ecoSavePct ?? 0) - (b.delta.ecoSavePct ?? 0))[0]
  if (worstEco && worstEco.delta.ecoSavePct != null && worstEco.delta.ecoSavePct <= -15) {
    findings.push({
      kind: 'under',
      metric: 'eco save%',
      player: worstEco.name,
      delta: worstEco.delta.ecoSavePct,
      note: `${worstEco.delta.ecoSavePct.toFixed(0)}pp eco save vs team avg — over-extending on save rounds`,
    })
  }
  // 4. Best damage-per-round delta (carry candidate)
  const bestDmg = [...players]
    .filter((p) => p.delta.avgDamagePerRound != null && p.delta.avgDamagePerRound > 0)
    .sort((a, b) => (b.delta.avgDamagePerRound ?? 0) - (a.delta.avgDamagePerRound ?? 0))[0]
  if (bestDmg && bestDmg.delta.avgDamagePerRound != null && bestDmg.delta.avgDamagePerRound >= 25) {
    findings.push({
      kind: 'over',
      metric: 'dmg/round',
      player: bestDmg.name,
      delta: bestDmg.delta.avgDamagePerRound,
      note: `+${bestDmg.delta.avgDamagePerRound.toFixed(0)} dmg/round vs team avg — carried the fragging`,
    })
  }
  return findings.slice(0, 4)
}
