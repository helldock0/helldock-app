// Henrik V4 → Helldock row transformer. V3 is no longer supported.

import { AGENT_TO_ROLE } from '@/lib/valorant'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawMatch = any

function classifyRoundType(teamEcon: number, oppEcon: number, roundNum: number): string {
  if (roundNum === 1 || roundNum === 13) return 'Pistol'
  if (roundNum >= 25 && (roundNum - 25) % 2 === 0) return 'Pistol'
  if (teamEcon < 5000) return 'Eco'
  if (teamEcon < 13000) {
    if (oppEcon < 5000) return 'Anti-Eco'
    return 'Bonus'
  }
  if (oppEcon < 5000) return 'Anti-Eco'
  return 'Full Buy'
}

function deriveHalf(roundNum: number): string {
  if (roundNum <= 12) return '1st'
  if (roundNum <= 24) return '2nd'
  return 'OT'
}

function deriveSide(roundNum: number, startSide: string): string | null {
  if (roundNum <= 12) return startSide
  if (roundNum <= 24) return startSide === 'Attack' ? 'Defense' : 'Attack'
  return null
}

function riotKey(name: string, tag: string) {
  return `${name}#${tag}`
}

// ── V4 metadata extraction ──────────────────────────────────────────────────
//   players: flat array w/ `team_id` ('Red'|'Blue'), `agent.name`, `stats.*`
//   teams:   flat array w/ `team_id`, `rounds:{won,lost}`, `won`
//   rounds:  flat array w/ `result`, `winning_team`, `plant`, `defuse`, `stats[]`
//   kills:   flat array (top-level) — replaces per-player `kill_events`
//   metadata.match_id, started_at (ISO), map.name, queue.name
function extractMatchMetadata(match: RawMatch, ourMainRiotId: string) {
  const meta = match?.metadata ?? {}
  const flatPlayers: RawMatch[] = Array.isArray(match?.players) ? match.players : []
  const flatTeams: RawMatch[] = Array.isArray(match?.teams) ? match.teams : []
  const kills: RawMatch[] = Array.isArray(match?.kills) ? match.kills : []

  const mainIdLower = ourMainRiotId.toLowerCase()
  let ourColor: 'red' | 'blue' | 'unknown' = 'unknown'
  for (const p of flatPlayers) {
    if (riotKey(p.name ?? '', p.tag ?? '').toLowerCase() === mainIdLower) {
      const tid = String(p.team_id ?? '').toLowerCase()
      if (tid === 'red' || tid === 'blue') ourColor = tid
      break
    }
  }

  const ourPlayers = flatPlayers.filter(
    (p) => String(p.team_id ?? '').toLowerCase() === ourColor
  )
  const oppPlayers = flatPlayers.filter((p) => {
    const tid = String(p.team_id ?? '').toLowerCase()
    return tid !== ourColor && (tid === 'red' || tid === 'blue')
  })

  const ourTeam =
    flatTeams.find((t) => String(t.team_id ?? '').toLowerCase() === ourColor) ?? {}
  const oppTeam =
    flatTeams.find((t) => {
      const tid = String(t.team_id ?? '').toLowerCase()
      return tid !== ourColor && (tid === 'red' || tid === 'blue')
    }) ?? {}

  let date = ''
  if (typeof meta.started_at === 'string') date = meta.started_at.split('T')[0]
  else if (typeof meta.game_start === 'number' && meta.game_start > 0) {
    date = new Date(meta.game_start * 1000).toISOString().split('T')[0]
  }

  const mapName =
    typeof meta.map === 'string' ? meta.map : (meta.map?.name ?? meta.map?.short ?? '')
  const queueLabel =
    typeof meta.queue === 'string'
      ? meta.queue
      : (meta.queue?.name ?? meta.queue?.id ?? meta.mode ?? '')

  const ourScore: number = ourTeam.rounds?.won ?? ourTeam.rounds_won ?? 0
  const oppScore: number = oppTeam.rounds?.won ?? oppTeam.rounds_won ?? 0
  const ourWon = Boolean(ourTeam.won ?? ourTeam.has_won)

  // Group kills by round index (0-based as Henrik returns)
  const killsByRound: Record<number, RawMatch[]> = {}
  for (const k of kills) {
    const ri = typeof k.round === 'number' ? k.round : -1
    if (ri < 0) continue
    killsByRound[ri] = killsByRound[ri] ?? []
    killsByRound[ri].push(k)
  }

  return {
    henrikId: meta.match_id ?? meta.matchid ?? '',
    date,
    map: mapName as string,
    mode: queueLabel as string,
    roundsPlayed: (meta.rounds_played ?? match?.rounds?.length ?? 0) as number,
    ourColor,
    ourScore,
    oppScore,
    result: ourWon ? 'W' : 'L',
    ourPlayersRaw: ourPlayers,
    oppPlayersRaw: oppPlayers,
    roundsRaw: (match?.rounds ?? []) as RawMatch[],
    killsByRound,
  }
}

function determineStartSide(meta: ReturnType<typeof extractMatchMetadata>): string {
  const rounds = meta.roundsRaw
  if (!rounds.length) return 'Attack'
  const r0 = rounds[0]
  if (r0?.plant) {
    const plantedTeam = String(r0.plant.player?.team ?? '').toLowerCase()
    return plantedTeam === meta.ourColor ? 'Attack' : 'Defense'
  }
  return 'Attack'
}

// V4 round.stats[] iteration helper
function calcTeamEcon(roundData: RawMatch, ourPuuids: Set<string>): number {
  let total = 0
  for (const ps of roundData.stats ?? []) {
    if (ourPuuids.has(ps.player?.puuid)) {
      total += ps.economy?.loadout_value ?? 0
    }
  }
  return total
}

function puuidToInfo(
  puuid: string,
  ourPlayers: RawMatch[],
  oppPlayers: RawMatch[]
): { name: string; tag: string; isOurs: boolean } | null {
  for (const p of ourPlayers) {
    if (p.puuid === puuid) return { name: p.name ?? '', tag: p.tag ?? '', isOurs: true }
  }
  for (const p of oppPlayers) {
    if (p.puuid === puuid) return { name: p.name ?? '', tag: p.tag ?? '', isOurs: false }
  }
  return null
}

// ── Per-puuid + per-round derived stats ─────────────────────────────────────

type PerPuuidAgg = {
  plants: number
  defuses: number
  fk: number
  fd: number
  two_k: number
  three_k: number
  four_k: number
  aces: number
  clutches: number
  clutch_1v2plus: number
}

function emptyAgg(): PerPuuidAgg {
  return { plants: 0, defuses: 0, fk: 0, fd: 0, two_k: 0, three_k: 0, four_k: 0, aces: 0, clutches: 0, clutch_1v2plus: 0 }
}

function bucketMultikill(agg: PerPuuidAgg, kills: number) {
  if (kills === 2) agg.two_k++
  else if (kills === 3) agg.three_k++
  else if (kills === 4) agg.four_k++
  else if (kills >= 5) agg.aces++
}

function deriveRoundEndType(rnd: RawMatch): string | null {
  // V4: `rnd.result` is already the end-type string ("Elimination", "Defuse", "Detonate", "Time", etc.)
  if (typeof rnd.result === 'string' && rnd.result.length > 0) return rnd.result
  if (rnd.defuse) return 'Defuse'
  if (rnd.plant) return 'Detonate'
  return 'Elimination'
}

function deriveMvpPuuid(rnd: RawMatch, ourPuuids: Set<string>): string | null {
  let best = -1
  let bestPuuid: string | null = null
  for (const ps of rnd.stats ?? []) {
    const puuid: string | undefined = ps.player?.puuid
    if (!puuid || !ourPuuids.has(puuid)) continue
    const score = ps.stats?.score ?? 0
    if (score > best) {
      best = score
      bestPuuid = puuid
    }
  }
  return bestPuuid
}

type ClutchInfo = {
  clutchType: string | null
  clutchPuuid: string | null
  ours: boolean
}

function detectClutch(
  killEvents: RawMatch[],
  ourPuuids: Set<string>,
  oppPuuids: Set<string>
): ClutchInfo {
  const events = killEvents
    .map((k) => ({
      t: k.time_in_round_in_ms ?? 0,
      killer: k.killer?.puuid ?? '',
      victim: k.victim?.puuid ?? '',
    }))
    .sort((a, b) => a.t - b.t)

  const aliveOurs = new Set(ourPuuids)
  const aliveOpps = new Set(oppPuuids)
  let clutchPuuid: string | null = null
  let clutchType: number | null = null
  let clutchOpps = false

  for (const ev of events) {
    if (aliveOurs.has(ev.victim)) aliveOurs.delete(ev.victim)
    else if (aliveOpps.has(ev.victim)) aliveOpps.delete(ev.victim)

    if (clutchPuuid === null) {
      if (aliveOurs.size === 1 && aliveOpps.size >= 2) {
        clutchPuuid = aliveOurs.values().next().value ?? null
        clutchType = aliveOpps.size
      } else if (aliveOpps.size === 1 && aliveOurs.size >= 2) {
        clutchOpps = true
        clutchType = aliveOurs.size
      }
    }
  }

  if (clutchPuuid && clutchType) return { clutchType: `1v${clutchType}`, clutchPuuid, ours: true }
  if (clutchOpps && clutchType) return { clutchType: `1v${clutchType}`, clutchPuuid: null, ours: false }
  return { clutchType: null, clutchPuuid: null, ours: false }
}

function detectTrade(
  killEvents: RawMatch[],
  ourPuuids: Set<string>,
  oppPuuids: Set<string>
): boolean {
  const events = killEvents
    .map((k) => ({
      t: k.time_in_round_in_ms ?? 0,
      killer: k.killer?.puuid ?? '',
      victim: k.victim?.puuid ?? '',
    }))
    .sort((a, b) => a.t - b.t)

  if (events.length === 0) return false
  const first = events[0]
  const victimSide = ourPuuids.has(first.victim) ? 'ours' : oppPuuids.has(first.victim) ? 'opps' : null
  if (!victimSide) return false
  const teammates = victimSide === 'ours' ? ourPuuids : oppPuuids
  const killerPuuid = first.killer

  // Trade window: 5 seconds (5000 ms in V4 ms-based timing)
  for (const ev of events.slice(1)) {
    if (ev.t - first.t > 5000) break
    if (ev.victim === killerPuuid && teammates.has(ev.killer)) return true
  }
  return false
}

// ── Public types ───────────────────────────────────────────────────────────

export type RoundData = {
  round_num: number
  half: string
  side: string | null
  our_econ: number
  their_econ: number
  round_type: string
  site: string
  outcome: string
  first_blood: string | null
  fb_player: string | null
  fb_weapon: string | null
  planter: string | null
  defuser: string | null
  fd_player: string | null
  was_traded: boolean | null
  clutch_type: string | null
  clutch_player: string | null
  mvp: string | null
  setup: string | null
  plant_time_in_round: number | null
  defuse_time_in_round: number | null
  our_econ_spent: number | null
  their_econ_spent: number | null
}

export type OurPlayerData = {
  riot_key: string
  agent: string
  role: string
  k: number
  d: number
  a: number
  acs: number
  plus_minus: number
  plants: number
  defuses: number
  fk: number
  fd: number
  two_k: number
  three_k: number
  four_k: number
  aces: number
  clutches: number
  clutch_1v2plus: number
  hs: number | null
  bs: number | null
  ls: number | null
  damage_made: number | null
  damage_received: number | null
  adr: number | null
  ability_c: number | null
  ability_q: number | null
  ability_e: number | null
  ability_x: number | null
  rounds_afk: number | null
  friendly_fire_outgoing: number | null
  friendly_fire_incoming: number | null
}

export type OppPlayerData = {
  opp_player_name: string
  riot_id_full: string
  agent: string
  k: number
  d: number
  a: number
  acs: number
  fb: number
  plants: number
  defuses: number
  hs: number | null
  bs: number | null
  ls: number | null
  damage_made: number | null
  damage_received: number | null
  adr: number | null
}

export type MatchData = {
  henrik_id: string
  match_date: string
  match_type: string
  opponent_name: string
  map_name: string
  pick: string
  start_side: string
  our_score: number
  opp_score: number
  result: string
  our_agents: string[]
  opp_agents: string[]
  rounds_played: number
  scrim_format: string
  is_manual_entry: false
}

export type TransformResult = {
  matchData: MatchData
  rounds: RoundData[]
  ourPlayers: OurPlayerData[]
  oppPlayers: OppPlayerData[]
}

// ── Main exports ────────────────────────────────────────────────────────────

export function deriveOppTeamName(meta: ReturnType<typeof extractMatchMetadata>): string {
  const opp = meta.oppPlayersRaw
  if (!opp.length) return 'Unknown Opp'
  const tags = opp.map((p: RawMatch) => p.tag ?? '').filter(Boolean)
  if (tags.length && new Set(tags).size === 1) return `[${tags[0]}]`
  const first = opp[0]
  return first.tag ? `vs ${first.name}#${first.tag} (mix)` : 'Unknown Opp'
}

// V4 ability_casts: { grenade, ability1, ability2, ultimate }  (NOT c_cast etc.)
// Mapping convention: C=grenade · Q=ability1 · E=ability2 · X=ultimate
function extractV4Player(p: RawMatch, roundsPlayed: number) {
  const stats = p.stats ?? {}
  const dmg = stats.damage ?? {}
  const beh = p.behavior ?? {}
  const ff = beh.friendly_fire ?? {}
  const cast = p.ability_casts ?? {}

  const hs = typeof stats.headshots === 'number' ? stats.headshots : null
  const bs = typeof stats.bodyshots === 'number' ? stats.bodyshots : null
  const ls = typeof stats.legshots === 'number' ? stats.legshots : null

  const damageMade =
    typeof dmg.dealt === 'number'
      ? dmg.dealt
      : typeof dmg.made === 'number'
      ? dmg.made
      : null
  const damageReceived = typeof dmg.received === 'number' ? dmg.received : null

  const adr =
    damageMade != null && roundsPlayed > 0
      ? Math.round((damageMade / roundsPlayed) * 10) / 10
      : null

  return {
    hs, bs, ls,
    damage_made: damageMade,
    damage_received: damageReceived,
    adr,
    ability_c: typeof cast.grenade === 'number' ? cast.grenade : null,
    ability_q: typeof cast.ability1 === 'number' ? cast.ability1 : null,
    ability_e: typeof cast.ability2 === 'number' ? cast.ability2 : null,
    ability_x: typeof cast.ultimate === 'number' ? cast.ultimate : null,
    rounds_afk: typeof beh.afk_rounds === 'number' ? beh.afk_rounds : null,
    friendly_fire_outgoing:
      typeof ff.outgoing === 'number' ? Math.round(ff.outgoing * 10) / 10 : null,
    friendly_fire_incoming:
      typeof ff.incoming === 'number' ? Math.round(ff.incoming * 10) / 10 : null,
  }
}

export function transformMatchToRows(
  match: RawMatch,
  mainRiotId: string,
  roster: Record<string, string>,
  isPremier: boolean
): TransformResult | { error: string } {
  const meta = extractMatchMetadata(match, mainRiotId)

  if (meta.ourColor === 'unknown') {
    return { error: `Could not identify our team (main account ${mainRiotId} not found in match)` }
  }

  const startSide = determineStartSide(meta)
  const roundsPlayed = Math.max(meta.roundsPlayed, 1)

  // Match data
  const ourAgents = meta.ourPlayersRaw.slice(0, 5).map((p: RawMatch) => p.agent?.name ?? p.character ?? '')
  const oppAgents = meta.oppPlayersRaw.slice(0, 5).map((p: RawMatch) => p.agent?.name ?? p.character ?? '')
  const oppName = deriveOppTeamName(meta)

  const matchData: MatchData = {
    henrik_id: meta.henrikId,
    match_date: meta.date,
    match_type: isPremier ? 'Premier' : 'Scrim',
    opponent_name: oppName,
    map_name: meta.map,
    pick: 'Our Pick',
    start_side: startSide,
    our_score: meta.ourScore,
    opp_score: meta.oppScore,
    result: meta.result,
    our_agents: ourAgents,
    opp_agents: oppAgents,
    rounds_played: meta.roundsPlayed,
    scrim_format: 'First to 13',
    is_manual_entry: false,
  }

  // Rounds + per-puuid aggregations
  const ourPuuids = new Set(meta.ourPlayersRaw.map((p: RawMatch) => p.puuid as string))
  const oppPuuids = new Set(meta.oppPlayersRaw.map((p: RawMatch) => p.puuid as string))
  const perPuuid: Record<string, PerPuuidAgg> = {}

  function getAgg(puuid: string): PerPuuidAgg {
    if (!perPuuid[puuid]) perPuuid[puuid] = emptyAgg()
    return perPuuid[puuid]
  }

  const rounds: RoundData[] = meta.roundsRaw.map((rnd: RawMatch, idx: number) => {
    const roundNum = idx + 1
    const killEvents = meta.killsByRound[idx] ?? []

    const winningTeam = String(rnd.winning_team ?? rnd.winning_team_id ?? '').toLowerCase()
    const outcome = winningTeam === meta.ourColor ? 'W' : 'L'

    const plant = rnd.plant ?? null
    const defuse = rnd.defuse ?? null
    const site = plant?.site || 'N/A'
    const plantTime: number | null =
      plant && typeof plant.round_time_in_ms === 'number' ? plant.round_time_in_ms / 1000 : null
    const defuseTime: number | null =
      defuse && typeof defuse.round_time_in_ms === 'number' ? defuse.round_time_in_ms / 1000 : null

    const ourEcon = calcTeamEcon(rnd, ourPuuids)
    const theirEcon = calcTeamEcon(rnd, oppPuuids)
    const roundType = classifyRoundType(ourEcon, theirEcon, roundNum)

    // First kill / first death from kills timeline (sorted by time_in_round_in_ms)
    const sortedKills = [...killEvents].sort(
      (a, b) => (a.time_in_round_in_ms ?? 0) - (b.time_in_round_in_ms ?? 0)
    )
    const fk = sortedKills[0]

    let firstBlood: string | null = null
    let fbPlayer: string | null = null
    let fbWeapon: string | null = null
    let fdPlayer: string | null = null

    if (fk?.killer?.puuid) {
      const killer = puuidToInfo(fk.killer.puuid, meta.ourPlayersRaw, meta.oppPlayersRaw)
      const victim = puuidToInfo(fk.victim?.puuid, meta.ourPlayersRaw, meta.oppPlayersRaw)
      fbWeapon = fk.weapon?.name ?? null

      if (killer?.isOurs) {
        firstBlood = 'Us'
        const displayName = roster[riotKey(killer.name, killer.tag)]
        fbPlayer = displayName ?? riotKey(killer.name, killer.tag)
      } else if (killer && !killer.isOurs) {
        firstBlood = 'Them'
        fbPlayer = 'Opp Player'
      }

      if (victim?.isOurs) {
        const displayName = roster[riotKey(victim.name, victim.tag)]
        fdPlayer = displayName ?? riotKey(victim.name, victim.tag)
      } else if (victim && !victim.isOurs) {
        fdPlayer = 'Opp Player'
      }

      // Per-puuid fk/fd tallies
      if (fk.killer.puuid) getAgg(fk.killer.puuid).fk++
      if (fk.victim?.puuid) getAgg(fk.victim.puuid).fd++
    }

    // Planter
    let planter: string | null = null
    if (plant?.player?.puuid) {
      getAgg(plant.player.puuid).plants++
      const planterInfo = puuidToInfo(plant.player.puuid, meta.ourPlayersRaw, meta.oppPlayersRaw)
      if (planterInfo?.isOurs) {
        planter = roster[riotKey(planterInfo.name, planterInfo.tag)] ?? riotKey(planterInfo.name, planterInfo.tag)
      } else if (planterInfo) {
        planter = 'Opp Player'
      }
    }

    // Defuser
    let defuser: string | null = null
    if (defuse?.player?.puuid) {
      getAgg(defuse.player.puuid).defuses++
      const defuserInfo = puuidToInfo(defuse.player.puuid, meta.ourPlayersRaw, meta.oppPlayersRaw)
      if (defuserInfo?.isOurs) {
        defuser = roster[riotKey(defuserInfo.name, defuserInfo.tag)] ?? riotKey(defuserInfo.name, defuserInfo.tag)
      } else if (defuserInfo) {
        defuser = 'Opp Player'
      }
    }

    // Per-round multikill bucketing — count kills by killer puuid in this round
    const killsByKiller: Record<string, number> = {}
    for (const k of killEvents) {
      const kp = k.killer?.puuid
      if (!kp) continue
      killsByKiller[kp] = (killsByKiller[kp] ?? 0) + 1
    }
    for (const puuid of Object.keys(killsByKiller)) {
      const n = killsByKiller[puuid]
      if (n >= 2) bucketMultikill(getAgg(puuid), n)
    }

    // Clutch + trade + mvp
    const clutch = detectClutch(killEvents, ourPuuids, oppPuuids)
    let clutchPlayerName: string | null = null
    if (clutch.ours && clutch.clutchPuuid && outcome === 'W') {
      const info = puuidToInfo(clutch.clutchPuuid, meta.ourPlayersRaw, meta.oppPlayersRaw)
      if (info) {
        clutchPlayerName = roster[riotKey(info.name, info.tag)] ?? riotKey(info.name, info.tag)
        const agg = getAgg(clutch.clutchPuuid)
        agg.clutches++
        if (clutch.clutchType && clutch.clutchType !== '1v1') agg.clutch_1v2plus++
      }
    } else if (!clutch.ours && clutch.clutchType && outcome === 'L') {
      clutchPlayerName = 'Opp Player'
    }

    const wasTraded = detectTrade(killEvents, ourPuuids, oppPuuids)

    const mvpPuuid = deriveMvpPuuid(rnd, ourPuuids)
    let mvpName: string | null = null
    if (mvpPuuid) {
      const info = puuidToInfo(mvpPuuid, meta.ourPlayersRaw, meta.oppPlayersRaw)
      if (info) mvpName = roster[riotKey(info.name, info.tag)] ?? riotKey(info.name, info.tag)
    }

    return {
      round_num: roundNum,
      half: deriveHalf(roundNum),
      side: deriveSide(roundNum, startSide),
      our_econ: ourEcon,
      their_econ: theirEcon,
      round_type: roundType,
      site,
      outcome,
      first_blood: firstBlood,
      fb_player: fbPlayer,
      fb_weapon: fbWeapon,
      planter,
      defuser,
      fd_player: fdPlayer,
      was_traded: wasTraded,
      clutch_type:
        (clutch.ours && outcome === 'W') || (!clutch.ours && outcome === 'L')
          ? clutch.clutchType
          : null,
      clutch_player: clutchPlayerName,
      mvp: mvpName,
      setup: deriveRoundEndType(rnd),
      plant_time_in_round: plantTime,
      defuse_time_in_round: defuseTime,
      // V4 dropped `economy.spent` per-round-per-player; loadout_value IS the spend that round
      our_econ_spent: ourEcon,
      their_econ_spent: theirEcon,
    }
  })

  // Our players
  const ourPlayers: OurPlayerData[] = meta.ourPlayersRaw.slice(0, 5).map((p: RawMatch) => {
    const agent = p.agent?.name ?? p.character ?? ''
    const stats = p.stats ?? {}
    const score = stats.score ?? 0
    const acs = Math.round((score / roundsPlayed) * 10) / 10
    const k = stats.kills ?? 0
    const d = stats.deaths ?? 0
    const a = stats.assists ?? 0
    const agg = perPuuid[p.puuid] ?? emptyAgg()
    const v4 = extractV4Player(p, roundsPlayed)

    return {
      riot_key: riotKey(p.name ?? '', p.tag ?? ''),
      agent,
      role: AGENT_TO_ROLE[agent] ?? '',
      k, d, a, acs,
      plus_minus: k - d,
      plants: agg.plants,
      defuses: agg.defuses,
      fk: agg.fk,
      fd: agg.fd,
      two_k: agg.two_k,
      three_k: agg.three_k,
      four_k: agg.four_k,
      aces: agg.aces,
      clutches: agg.clutches,
      clutch_1v2plus: agg.clutch_1v2plus,
      ...v4,
    }
  })

  // Opp players
  const oppPlayers: OppPlayerData[] = meta.oppPlayersRaw.slice(0, 5).map((p: RawMatch) => {
    const stats = p.stats ?? {}
    const score = stats.score ?? 0
    const acs = Math.round((score / roundsPlayed) * 10) / 10
    const name = p.name ?? ''
    const tag = p.tag ?? ''
    const agg = perPuuid[p.puuid] ?? emptyAgg()
    const v4 = extractV4Player(p, roundsPlayed)

    return {
      opp_player_name: name || 'Player',
      riot_id_full: tag ? riotKey(name, tag) : name,
      agent: p.agent?.name ?? p.character ?? '',
      k: stats.kills ?? 0,
      d: stats.deaths ?? 0,
      a: stats.assists ?? 0,
      acs,
      fb: agg.fk,
      plants: agg.plants,
      defuses: agg.defuses,
      hs: v4.hs,
      bs: v4.bs,
      ls: v4.ls,
      damage_made: v4.damage_made,
      damage_received: v4.damage_received,
      adr: v4.adr,
    }
  })

  return { matchData, rounds, ourPlayers, oppPlayers }
}
