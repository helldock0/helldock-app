import { pct } from '@/lib/dashboard'

// ── Input types ──────────────────────────────────────────────────────────────

export type ImpactMatchPlayer = {
  match_id: string
  player_id: string | null
  puuid: string | null
  player: { display_name: string } | null
}

export type ImpactRound = {
  match_id: string
  round_num: number
  outcome: string | null
}

export type ImpactKillEvent = {
  match_id: string
  round_num: number
  killer_puuid: string | null
  victim_puuid: string | null
  killer_is_ours: boolean | null
  ts_in_round_ms: number | null
}

// ── Output type ──────────────────────────────────────────────────────────────

export type PlayerImpact = {
  playerId: string
  name: string

  // Trade
  totalDeaths: number
  deathsTraded: number
  tradeRate: number | null // % of deaths that got traded back within 5s

  // Drag = P(round=L | died) − P(round=L | alive). Positive => team-dependent.
  drag: number | null
  lossPctWhenDead: number | null
  lossPctWhenAlive: number | null
  diedSample: number   // rounds where this player died
  aliveSample: number  // rounds where this player survived

  // Carry = P(round=W | had ≥1 kill) − P(round=W | had 0 kills).
  carry: number | null
  winPctWithKill: number | null
  winPctWithoutKill: number | null
  hadKillSample: number   // rounds with ≥1 kill
  noKillSample: number    // rounds with 0 kills (and was in the match)
}

// Trade window in ms — Henrik V4 industry convention.
const TRADE_WINDOW_MS = 5000

/**
 * Minimum sample (rounds died AND rounds alive) before a player is flagged for
 * "most depended on" surfacing. Below this, drag is computed but treated as
 * noise. Set conservatively low for a private single-team app with ~20 matches.
 */
export const MIN_DRAG_SAMPLE = 30

// ── Compute ──────────────────────────────────────────────────────────────────

export function computePlayerImpact(
  matchPlayers: ImpactMatchPlayer[],
  rounds: ImpactRound[],
  killEvents: ImpactKillEvent[]
): PlayerImpact[] {
  // 1. Build (match_id, puuid) → playerId/name index, scoped per match so a
  //    stand-in's identity doesn't leak across matches.
  const idByMatchPuuid: Record<string, { playerId: string; name: string }> = {}
  // Also build a global puuid → roster info for trade detection (we only need
  // to know if the puuid is one of our roster players in that match).
  const playerNamesById: Record<string, string> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.puuid || !mp.player) continue
    idByMatchPuuid[`${mp.match_id}|${mp.puuid}`] = {
      playerId: mp.player_id,
      name: mp.player.display_name,
    }
    playerNamesById[mp.player_id] = mp.player.display_name
  }

  // 2. Index round outcomes for the drag/carry compute.
  const outcomeByRound: Record<string, string | null> = {}
  for (const r of rounds) {
    outcomeByRound[`${r.match_id}|${r.round_num}`] = r.outcome
  }

  // 3. Pre-bucket kill events by (match, round) for trade scanning AND for
  //    finding who died / got a kill in each round.
  type Ev = ImpactKillEvent
  const eventsByRound: Record<string, Ev[]> = {}
  for (const e of killEvents) {
    const key = `${e.match_id}|${e.round_num}`
    eventsByRound[key] = eventsByRound[key] ?? []
    eventsByRound[key].push(e)
  }
  for (const key of Object.keys(eventsByRound)) {
    eventsByRound[key].sort(
      (a, b) => (a.ts_in_round_ms ?? 0) - (b.ts_in_round_ms ?? 0)
    )
  }

  // 4. Aggregate per player.
  type Agg = {
    name: string
    deaths: number
    deathsTraded: number
    diedSample: number
    diedLoss: number
    aliveSample: number
    aliveLoss: number
    hadKillSample: number
    hadKillWin: number
    noKillSample: number
    noKillWin: number
  }
  const empty = (name: string): Agg => ({
    name,
    deaths: 0,
    deathsTraded: 0,
    diedSample: 0,
    diedLoss: 0,
    aliveSample: 0,
    aliveLoss: 0,
    hadKillSample: 0,
    hadKillWin: 0,
    noKillSample: 0,
    noKillWin: 0,
  })
  const agg: Record<string, Agg> = {}

  // 4a. Trade rate — scan every death event for our roster players.
  for (const key of Object.keys(eventsByRound)) {
    const evs = eventsByRound[key]
    for (let i = 0; i < evs.length; i++) {
      const death = evs[i]
      // Only OUR deaths (their killer, our victim).
      if (death.killer_is_ours !== false) continue
      if (!death.victim_puuid) continue
      const victim = idByMatchPuuid[`${death.match_id}|${death.victim_puuid}`]
      if (!victim) continue // not roster — stand-in or missing puuid

      const a = agg[victim.playerId] ?? empty(victim.name)
      a.deaths++

      // Look forward for a trade within the window.
      const deathTs = death.ts_in_round_ms ?? 0
      const killerPuuid = death.killer_puuid
      let traded = false
      if (killerPuuid != null) {
        for (let j = i + 1; j < evs.length; j++) {
          const next = evs[j]
          const nextTs = next.ts_in_round_ms ?? 0
          if (nextTs - deathTs > TRADE_WINDOW_MS) break
          if (next.killer_is_ours === true && next.victim_puuid === killerPuuid) {
            traded = true
            break
          }
        }
      }
      if (traded) a.deathsTraded++
      agg[victim.playerId] = a
    }
  }

  // 4b. Drag + carry — per player, per (match, round) where they were present.
  //     A player is "present in a round" if they have a match_players row for
  //     that match. We use the per-match puuid index to determine presence.
  type MatchPresence = {
    matchId: string
    playerIds: Set<string>
    puuidByPlayer: Record<string, string>
  }
  const presenceByMatch: Record<string, MatchPresence> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || !mp.puuid) continue
    const cur = presenceByMatch[mp.match_id] ?? {
      matchId: mp.match_id,
      playerIds: new Set<string>(),
      puuidByPlayer: {},
    }
    cur.playerIds.add(mp.player_id)
    cur.puuidByPlayer[mp.player_id] = mp.puuid
    presenceByMatch[mp.match_id] = cur
  }

  for (const r of rounds) {
    const outcomeKey = `${r.match_id}|${r.round_num}`
    const outcome = outcomeByRound[outcomeKey]
    if (outcome !== 'W' && outcome !== 'L') continue
    const presence = presenceByMatch[r.match_id]
    if (!presence) continue

    const evs = eventsByRound[outcomeKey] ?? []
    const diedThisRound = new Set<string>()
    const hadKillThisRound = new Set<string>()
    for (const e of evs) {
      if (e.killer_is_ours === false && e.victim_puuid) {
        const victim = idByMatchPuuid[`${e.match_id}|${e.victim_puuid}`]
        if (victim) diedThisRound.add(victim.playerId)
      }
      if (e.killer_is_ours === true && e.killer_puuid) {
        const killer = idByMatchPuuid[`${e.match_id}|${e.killer_puuid}`]
        if (killer) hadKillThisRound.add(killer.playerId)
      }
    }

    const presentIds = Array.from(presence.playerIds)
    for (const pid of presentIds) {
      const a = agg[pid] ?? empty(playerNamesById[pid] ?? '—')
      if (diedThisRound.has(pid)) {
        a.diedSample++
        if (outcome === 'L') a.diedLoss++
      } else {
        a.aliveSample++
        if (outcome === 'L') a.aliveLoss++
      }
      if (hadKillThisRound.has(pid)) {
        a.hadKillSample++
        if (outcome === 'W') a.hadKillWin++
      } else {
        a.noKillSample++
        if (outcome === 'W') a.noKillWin++
      }
      agg[pid] = a
    }
  }

  // 5. Materialize PlayerImpact rows.
  return Object.keys(agg).map((playerId) => {
    const a = agg[playerId]
    const lossPctWhenDead = pct(a.diedLoss, a.diedSample)
    const lossPctWhenAlive = pct(a.aliveLoss, a.aliveSample)
    const drag =
      lossPctWhenDead != null && lossPctWhenAlive != null
        ? Math.round((lossPctWhenDead - lossPctWhenAlive) * 10) / 10
        : null
    const winPctWithKill = pct(a.hadKillWin, a.hadKillSample)
    const winPctWithoutKill = pct(a.noKillWin, a.noKillSample)
    const carry =
      winPctWithKill != null && winPctWithoutKill != null
        ? Math.round((winPctWithKill - winPctWithoutKill) * 10) / 10
        : null

    return {
      playerId,
      name: a.name,
      totalDeaths: a.deaths,
      deathsTraded: a.deathsTraded,
      tradeRate: pct(a.deathsTraded, a.deaths),
      drag,
      lossPctWhenDead,
      lossPctWhenAlive,
      diedSample: a.diedSample,
      aliveSample: a.aliveSample,
      carry,
      winPctWithKill,
      winPctWithoutKill,
      hadKillSample: a.hadKillSample,
      noKillSample: a.noKillSample,
    }
  })
}

/**
 * Returns the roster player whose drag value is the largest positive number,
 * subject to a minimum sample size on both sides (alive/dead).
 */
export function pickMostDepended(
  impacts: PlayerImpact[]
): { name: string; dragPp: number } | null {
  let best: { name: string; dragPp: number } | null = null
  for (const p of impacts) {
    if (p.drag == null) continue
    if (p.diedSample < MIN_DRAG_SAMPLE) continue
    if (p.aliveSample < MIN_DRAG_SAMPLE) continue
    if (p.drag <= 0) continue
    if (!best || p.drag > best.dragPp) {
      best = { name: p.name, dragPp: p.drag }
    }
  }
  return best
}
