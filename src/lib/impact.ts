import { pct } from '@/lib/dashboard'

// ── Input types ──────────────────────────────────────────────────────────────

export type ImpactMatchPlayer = {
  match_id: string
  player_id: string | null
  puuid: string | null
  player: { display_name: string } | null
  // S17 additions — needed for ACS stdev / Rating 2.0 normalization
  acs: number | null
  adr?: number | null
}

export type ImpactRound = {
  match_id: string
  round_num: number
  outcome: string | null
  plant_time_in_round?: number | null
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

  // S17 — KST% (KAST without the assist component, which Henrik doesn't expose
  // per round). Counts a round if the player got a kill, survived, OR was
  // trade-avenged. Industry consistency metric.
  kstPct: number | null
  kstSample: number

  // S17 — Opening-duel win rate (only counts is_first_blood=true events).
  opDuelWPct: number | null
  opDuelWins: number
  opDuelLosses: number

  // S17 — Multi-kill round conversion. For rounds where the player got
  // exactly 2 kills, what % did the round win? Same for 3+.
  twoKWinPct: number | null
  twoKSample: number
  threeKPlusWinPct: number | null
  threeKPlusSample: number

  // S17 — ACS consistency: stdev across match-level ACS scores. Lower = steadier.
  acsStdev: number | null
  acsCv: number | null  // coefficient of variation = stdev / mean (lower = more consistent)
  acsN: number

  // S17 — Pre-plant vs post-plant kill split (only counts rounds with a plant).
  prePlantKills: number
  postPlantKills: number

  // S17 — Helldock-flavored "Rating 2.0": weighted blend of KPR + APR + SPR + KST.
  // Normalized so 1.00 is roughly pro-average.
  rating2: number | null
  rating2KillsPerRound: number | null
  rating2SurvivalRate: number | null
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
    // S17 additions
    kstHits: number          // rounds where K, S, or T-deathed
    kstSample: number        // total rounds present
    opDuelWins: number       // first-blood events where this player was killer
    opDuelLosses: number     // first-blood events where this player was victim
    twoKWins: number         // rounds with exactly 2 kills that we won
    twoKSample: number       // rounds with exactly 2 kills
    threeKPlusWins: number   // rounds with >=3 kills that we won
    threeKPlusSample: number // rounds with >=3 kills
    acsValues: number[]      // per-match ACS for stdev computation
    prePlantKills: number    // kills before plant_time in same round
    postPlantKills: number   // kills at/after plant_time
    totalKills: number       // global kill count (for Rating 2.0 KPR)
    totalSurvived: number    // rounds the player did not die (for SPR)
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
    kstHits: 0,
    kstSample: 0,
    opDuelWins: 0,
    opDuelLosses: 0,
    twoKWins: 0,
    twoKSample: 0,
    threeKPlusWins: 0,
    threeKPlusSample: 0,
    acsValues: [],
    prePlantKills: 0,
    postPlantKills: 0,
    totalKills: 0,
    totalSurvived: 0,
  })
  const agg: Record<string, Agg> = {}

  // S17 — index plant time per round for pre/post-plant kill split.
  const plantTimeByRound: Record<string, number | null> = {}
  for (const r of rounds) {
    plantTimeByRound[`${r.match_id}|${r.round_num}`] =
      r.plant_time_in_round ?? null
  }

  // S17 — track which (player, round) deaths got traded so KST 'T' can use it.
  const tradedDeathKeys = new Set<string>() // `${playerId}|${match}|${round}`

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
      if (traded) {
        a.deathsTraded++
        tradedDeathKeys.add(
          `${victim.playerId}|${death.match_id}|${death.round_num}`
        )
      }
      agg[victim.playerId] = a
    }
  }

  // S17 — Opening duel scan. is_first_blood is on ImpactKillEvent? Actually
  // it's NOT on our type today, so we infer it: the first event chronologically
  // in a round IS the first blood. (We already sort events per round by ts.)
  for (const key of Object.keys(eventsByRound)) {
    const evs = eventsByRound[key]
    const fb = evs[0]
    if (!fb) continue
    if (fb.killer_puuid) {
      const killer = idByMatchPuuid[`${fb.match_id}|${fb.killer_puuid}`]
      if (killer) {
        const a = agg[killer.playerId] ?? empty(killer.name)
        a.opDuelWins++
        agg[killer.playerId] = a
      }
    }
    if (fb.victim_puuid) {
      const victim = idByMatchPuuid[`${fb.match_id}|${fb.victim_puuid}`]
      if (victim) {
        const a = agg[victim.playerId] ?? empty(victim.name)
        a.opDuelLosses++
        agg[victim.playerId] = a
      }
    }
  }

  // S17 — Per-match ACS collection for consistency stdev. Average a player's
  // multiple rows in one match (rare with stand-ins) defensively.
  type AcsBag = { sum: number; n: number }
  const acsByPlayerMatch: Record<string, AcsBag> = {}
  for (const mp of matchPlayers) {
    if (!mp.player_id || mp.acs == null) continue
    const key = `${mp.player_id}|${mp.match_id}`
    const cur = acsByPlayerMatch[key] ?? { sum: 0, n: 0 }
    cur.sum += mp.acs
    cur.n++
    acsByPlayerMatch[key] = cur
  }
  for (const key of Object.keys(acsByPlayerMatch)) {
    const [playerId] = key.split('|')
    const { sum, n } = acsByPlayerMatch[key]
    if (n === 0) continue
    const a = agg[playerId] ?? empty(playerNamesById[playerId] ?? '—')
    a.acsValues.push(sum / n)
    agg[playerId] = a
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
    const killCountThisRound: Record<string, number> = {}
    const plantTime = plantTimeByRound[outcomeKey]
    for (const e of evs) {
      if (e.killer_is_ours === false && e.victim_puuid) {
        const victim = idByMatchPuuid[`${e.match_id}|${e.victim_puuid}`]
        if (victim) diedThisRound.add(victim.playerId)
      }
      if (e.killer_is_ours === true && e.killer_puuid) {
        const killer = idByMatchPuuid[`${e.match_id}|${e.killer_puuid}`]
        if (killer) {
          killCountThisRound[killer.playerId] =
            (killCountThisRound[killer.playerId] ?? 0) + 1
          // S17 — pre/post-plant kill bucketing
          if (plantTime != null && e.ts_in_round_ms != null) {
            const plantMs = plantTime * 1000
            const a = agg[killer.playerId] ?? empty(killer.name)
            if (e.ts_in_round_ms < plantMs) a.prePlantKills++
            else a.postPlantKills++
            agg[killer.playerId] = a
          }
        }
      }
    }

    const presentIds = Array.from(presence.playerIds)
    for (const pid of presentIds) {
      const a = agg[pid] ?? empty(playerNamesById[pid] ?? '—')
      const kc = killCountThisRound[pid] ?? 0
      const died = diedThisRound.has(pid)

      if (died) {
        a.diedSample++
        if (outcome === 'L') a.diedLoss++
      } else {
        a.aliveSample++
        if (outcome === 'L') a.aliveLoss++
        a.totalSurvived++
      }
      if (kc > 0) {
        a.hadKillSample++
        if (outcome === 'W') a.hadKillWin++
      } else {
        a.noKillSample++
        if (outcome === 'W') a.noKillWin++
      }
      // S17 — KST: count round if K (got a kill) OR S (didn't die) OR T (was
      // traded after dying). Assists ('A') skipped — Henrik doesn't expose
      // per-round damage events. Column labels reflect this.
      a.kstSample++
      const traded = tradedDeathKeys.has(`${pid}|${r.match_id}|${r.round_num}`)
      const survived = !died
      if (kc > 0 || survived || traded) a.kstHits++

      // S17 — Multi-kill round conversion.
      if (kc === 2) {
        a.twoKSample++
        if (outcome === 'W') a.twoKWins++
      } else if (kc >= 3) {
        a.threeKPlusSample++
        if (outcome === 'W') a.threeKPlusWins++
      }

      // S17 — total kills count for Rating 2.0 KPR.
      a.totalKills += kc
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

    // S17 — KST%
    const kstPct = pct(a.kstHits, a.kstSample)
    // S17 — Opening duel
    const opDuelTotal = a.opDuelWins + a.opDuelLosses
    const opDuelWPct = pct(a.opDuelWins, opDuelTotal)
    // S17 — Multi-kill conversion
    const twoKWinPct = pct(a.twoKWins, a.twoKSample)
    const threeKPlusWinPct = pct(a.threeKPlusWins, a.threeKPlusSample)
    // S17 — ACS stdev / CV
    let acsStdev: number | null = null
    let acsCv: number | null = null
    if (a.acsValues.length >= 2) {
      const mean = a.acsValues.reduce((s, v) => s + v, 0) / a.acsValues.length
      const variance =
        a.acsValues.reduce((s, v) => s + (v - mean) * (v - mean), 0) /
        a.acsValues.length
      acsStdev = Math.round(Math.sqrt(variance) * 10) / 10
      acsCv = mean > 0 ? Math.round((acsStdev / mean) * 1000) / 10 : null
    }
    // S17 — Rating 2.0 (Helldock flavor). Weighted mean of normalized KPR,
    // survival, KST. Constants chosen so 1.00 ~= pro-tier average:
    //   pro KPR ≈ 0.72, survival ≈ 0.62, KST ≈ 73%.
    const kpr = a.kstSample > 0 ? a.totalKills / a.kstSample : null
    const spr = a.kstSample > 0 ? a.totalSurvived / a.kstSample : null
    const rating2KillsPerRound = kpr != null ? Math.round(kpr * 100) / 100 : null
    const rating2SurvivalRate = spr != null ? Math.round(spr * 100) / 100 : null
    let rating2: number | null = null
    if (kpr != null && spr != null && kstPct != null) {
      const norm =
        0.5 * (kpr / 0.72) +
        0.3 * (spr / 0.62) +
        0.2 * (kstPct / 73)
      rating2 = Math.round(norm * 100) / 100
    }

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
      // S17 outputs
      kstPct,
      kstSample: a.kstSample,
      opDuelWPct,
      opDuelWins: a.opDuelWins,
      opDuelLosses: a.opDuelLosses,
      twoKWinPct,
      twoKSample: a.twoKSample,
      threeKPlusWinPct,
      threeKPlusSample: a.threeKPlusSample,
      acsStdev,
      acsCv,
      acsN: a.acsValues.length,
      prePlantKills: a.prePlantKills,
      postPlantKills: a.postPlantKills,
      rating2,
      rating2KillsPerRound,
      rating2SurvivalRate,
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
