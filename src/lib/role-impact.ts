// S26 — Win-probability-weighted role impact. Pure compute.
//
// A "moment" is a kill-event-derived event tied to a round: a multikill, a
// clutch, or a first-blood. Each moment is weighted by:
//
//   signedScore = sign × leverage × weight
//
//   leverage = pre-round (1 − wpPct/100)  for OUR-WIN rounds
//            = pre-round (wpPct/100)      for OUR-LOSS rounds
//   weight   = per-kind base score (ace/4K/3K/2K/clutch tiers/fb)
//   sign     = +1 for positive moments on W rounds and fb_win
//            = −1 for fb_loss (lost the opening duel)
//
// Rationale: a 1v3 in a 5% round is hugely improbable to flip the round, so
// its leverage is 0.95 → multiplied by the 1v3 weight (0.7) → 0.665. A 3K in
// a 95% round we were already winning earns 0.05 × 0.5 = 0.025 — ~26× smaller.
//
// We DON'T credit multikills/clutches on rounds we lost; those moments are
// fragmentary partial-carries that didn't change the outcome. Only fb_loss
// applies on L rounds — coaches care about who's getting opened.

import {
  extractFeatures,
  predictWinProbability,
  type WPRound,
  type WPWeights,
} from '@/lib/win-probability'

// ── Input types (intentionally minimal — reuses analytics page fetches) ─────

export type ImpactRoleRound = {
  match_id: string
  round_num: number
  side: string | null
  outcome: string | null         // 'W' | 'L' | null
  round_type: string | null
  our_econ: number | null
  their_econ: number | null
  clutch_type: string | null     // '1v1' | '1v2' | '1v3' | '1v4' | '1v5' | null
  clutch_player: string | null   // display name
}

export type ImpactRoleMatchPlayer = {
  match_id: string
  player_id: string | null
  puuid: string | null
  display_name: string | null
  riot_name: string | null
}

export type ImpactRoleKillEvent = {
  match_id: string
  round_num: number
  killer_puuid: string | null
  victim_puuid: string | null
  killer_is_ours: boolean | null
  is_first_blood: boolean | null
}

export type ImpactRoleMatch = {
  id: string
  match_id_helldock: string
  opponent_name: string | null
  match_date: string
}

// ── Output types ────────────────────────────────────────────────────────────

export type LeverageMomentKind =
  | 'ace'
  | '1v5'
  | '1v4'
  | '4K'
  | '1v3'
  | '3K'
  | '2K'
  | '1v2'
  | 'fb_win'
  | 'fb_loss'

export type LeverageMoment = {
  playerId: string
  name: string
  matchId: string
  matchIdHelldock: string
  opponent: string | null
  matchDate: string
  round_num: number
  kind: LeverageMomentKind
  wpPctBefore: number       // 0..100
  outcome: 'W' | 'L'
  leverage: number          // 0..1 (round-flip surprise)
  weight: number            // base weight per kind
  signedScore: number       // sign × leverage × weight
}

export type PlayerLeverage = {
  playerId: string
  name: string
  levCarry: number          // sum of signedScore — sign reflects net carry/drag
  levMoments: number        // count of contributing moments
  topMoments: LeverageMoment[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const KIND_WEIGHT: Record<LeverageMomentKind, number> = {
  ace: 1.0,
  '1v5': 1.0,
  '1v4': 0.85,
  '4K': 0.7,
  '1v3': 0.7,
  '3K': 0.5,
  '2K': 0.2,
  '1v2': 0.4,
  fb_win: 0.15,
  fb_loss: 0.15,
}

// ── Compute ──────────────────────────────────────────────────────────────────

/**
 * Compute per-round pre-round WP for every round in the dataset by walking
 * each match in round-order. Returns `{match_id|round_num: wpPct}`.
 */
function computeWpByRound(
  rounds: ImpactRoleRound[],
  weights: WPWeights
): Record<string, number> {
  // Group + sort.
  const byMatch: Record<string, ImpactRoleRound[]> = {}
  for (const r of rounds) {
    byMatch[r.match_id] = byMatch[r.match_id] ?? []
    byMatch[r.match_id].push(r)
  }
  const out: Record<string, number> = {}
  for (const matchId of Object.keys(byMatch)) {
    const ms = byMatch[matchId].slice().sort((a, b) => a.round_num - b.round_num)
    let ourWins = 0
    let theirWins = 0
    for (const r of ms) {
      const wpRound: WPRound = {
        match_id: r.match_id,
        round_num: r.round_num,
        side: r.side,
        outcome: r.outcome,
        round_type: r.round_type,
        our_econ: r.our_econ,
        their_econ: r.their_econ,
      }
      const f = extractFeatures(wpRound, ourWins - theirWins)
      const wp = predictWinProbability(weights, f)
      out[`${r.match_id}|${r.round_num}`] = wp
      if (r.outcome === 'W') ourWins++
      else if (r.outcome === 'L') theirWins++
    }
  }
  return out
}

/**
 * Decide which multikill bucket a round-kill count falls into.
 * Returns null for 0–1 kills.
 */
function multikillKind(kills: number): LeverageMomentKind | null {
  if (kills >= 5) return 'ace'
  if (kills === 4) return '4K'
  if (kills === 3) return '3K'
  if (kills === 2) return '2K'
  return null
}

/**
 * Decide the LeverageMomentKind for a clutch_type string. Returns null for
 * '1v1' (too common to be high-leverage) or unparseable values.
 */
function clutchKind(clutchType: string | null): LeverageMomentKind | null {
  if (!clutchType) return null
  const m = clutchType.match(/^1v(\d)$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (n === 5) return '1v5'
  if (n === 4) return '1v4'
  if (n === 3) return '1v3'
  if (n === 2) return '1v2'
  return null
}

export function computeRoleImpact(
  matchPlayers: ImpactRoleMatchPlayer[],
  rounds: ImpactRoleRound[],
  killEvents: ImpactRoleKillEvent[],
  matches: ImpactRoleMatch[],
  wpWeights: WPWeights | null
): { players: PlayerLeverage[]; moments: LeverageMoment[] } {
  if (!wpWeights || rounds.length === 0) {
    return { players: [], moments: [] }
  }

  // Index: (match_id, puuid) → playerId+name
  const idByMatchPuuid: Record<string, { playerId: string; name: string }> = {}
  // Lower-cased riot_name → playerId+name for clutch attribution fallback
  const idByRiotNameLower: Record<string, { playerId: string; name: string }> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.display_name) continue
    if (mp.puuid) {
      idByMatchPuuid[`${mp.match_id}|${mp.puuid}`] = {
        playerId: mp.player_id,
        name: mp.display_name,
      }
    }
    if (mp.riot_name) {
      idByRiotNameLower[mp.riot_name.toLowerCase()] = {
        playerId: mp.player_id,
        name: mp.display_name,
      }
    }
  }

  // Match index for moment metadata
  const matchById: Record<string, ImpactRoleMatch> = {}
  for (const m of matches) matchById[m.id] = m

  // Pre-round WP lookup
  const wpByRound = computeWpByRound(rounds, wpWeights)

  // Group kills by (match_id, round_num)
  type Ev = ImpactRoleKillEvent
  const eventsByRound: Record<string, Ev[]> = {}
  for (const e of killEvents) {
    const key = `${e.match_id}|${e.round_num}`
    eventsByRound[key] = eventsByRound[key] ?? []
    eventsByRound[key].push(e)
  }

  const moments: LeverageMoment[] = []

  for (const r of rounds) {
    if (r.outcome !== 'W' && r.outcome !== 'L') continue
    const wpPct = wpByRound[`${r.match_id}|${r.round_num}`]
    if (typeof wpPct !== 'number') continue
    const m = matchById[r.match_id]
    if (!m) continue

    const leverage =
      r.outcome === 'W' ? 1 - wpPct / 100 : wpPct / 100   // 0..1
    const evs = eventsByRound[`${r.match_id}|${r.round_num}`] ?? []

    const pushMoment = (
      kind: LeverageMomentKind,
      playerId: string,
      name: string,
      sign: 1 | -1
    ): void => {
      const weight = KIND_WEIGHT[kind]
      const signedScore = sign * leverage * weight
      moments.push({
        playerId,
        name,
        matchId: r.match_id,
        matchIdHelldock: m.match_id_helldock,
        opponent: m.opponent_name,
        matchDate: m.match_date,
        round_num: r.round_num,
        kind,
        wpPctBefore: Math.round(wpPct * 10) / 10,
        outcome: r.outcome as 'W' | 'L',
        leverage: Math.round(leverage * 100) / 100,
        weight,
        signedScore: Math.round(signedScore * 1000) / 1000,
      })
    }

    if (r.outcome === 'W') {
      // Per-puuid kill count this round
      const kc: Record<string, number> = {}
      for (const e of evs) {
        if (e.killer_is_ours === false) continue   // only credit our kills
        const kp = e.killer_puuid
        if (!kp) continue
        kc[kp] = (kc[kp] ?? 0) + 1
      }
      for (const puuid of Object.keys(kc)) {
        const info = idByMatchPuuid[`${r.match_id}|${puuid}`]
        if (!info) continue
        const kind = multikillKind(kc[puuid])
        if (!kind) continue
        pushMoment(kind, info.playerId, info.name, 1)
      }
      // Clutch (only OUR clutches — clutch_player resolves to our roster)
      const ck = clutchKind(r.clutch_type)
      if (ck && r.clutch_player) {
        const info = idByRiotNameLower[r.clutch_player.toLowerCase()]
        if (info) pushMoment(ck, info.playerId, info.name, 1)
      }
      // First-blood win
      const fb = evs.find((e) => e.is_first_blood === true)
      if (fb && fb.killer_puuid) {
        const info = idByMatchPuuid[`${r.match_id}|${fb.killer_puuid}`]
        if (info) pushMoment('fb_win', info.playerId, info.name, 1)
      }
    } else {
      // L round — only credit fb_loss (our roster player got opened)
      const fb = evs.find((e) => e.is_first_blood === true)
      if (fb && fb.victim_puuid) {
        const info = idByMatchPuuid[`${r.match_id}|${fb.victim_puuid}`]
        if (info) pushMoment('fb_loss', info.playerId, info.name, -1)
      }
    }
  }

  // Bucket per player
  type Bag = { name: string; lev: number; n: number; moments: LeverageMoment[] }
  const byPid: Record<string, Bag> = {}
  for (const mt of moments) {
    const b = byPid[mt.playerId] ?? { name: mt.name, lev: 0, n: 0, moments: [] }
    b.lev += mt.signedScore
    b.n++
    b.moments.push(mt)
    byPid[mt.playerId] = b
  }
  // Materialize, top 3 moments sorted by abs(signedScore)
  const players: PlayerLeverage[] = Object.keys(byPid).map((pid) => {
    const b = byPid[pid]
    const top = b.moments
      .slice()
      .sort((a, b2) => Math.abs(b2.signedScore) - Math.abs(a.signedScore))
      .slice(0, 3)
    return {
      playerId: pid,
      name: b.name,
      levCarry: Math.round(b.lev * 100) / 100,
      levMoments: b.n,
      topMoments: top,
    }
  })

  return { players, moments }
}

/** Returns the single highest-abs-signedScore moment across the given matches. */
export function pickHighestLeverageMoment(
  moments: LeverageMoment[],
  sinceDateInclusive: string | null
): LeverageMoment | null {
  let best: LeverageMoment | null = null
  for (const m of moments) {
    if (sinceDateInclusive && m.matchDate < sinceDateInclusive) continue
    if (!best || Math.abs(m.signedScore) > Math.abs(best.signedScore)) best = m
  }
  return best
}
