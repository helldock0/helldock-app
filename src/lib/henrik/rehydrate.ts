// Shared rehydrate-one-match logic used by both:
//   - /api/matches/[id]/rehydrate (session-auth, single match)
//   - /api/cron/rehydrate-recent (CRON_SECRET-auth, batch)
//
// Takes a Supabase client (anon or admin) and a match UUID. Looks up the team,
// fetches fresh V4 data from Henrik, and patches rounds + kill_events +
// match_players + opp_players. Returns a structured summary (or an error string).

import type { SupabaseClient } from '@supabase/supabase-js'
import { TEAM_CONFIGS } from '@/lib/teams'
import { fetchMatchByIdV4, isPremierMatch } from '@/lib/henrik/client'
import { transformMatchToRows } from '@/lib/henrik/transformers'

export type RehydrateOk = {
  ok: true
  match_id_helldock: string
  rounds_patched: number
  match_players_patched: number
  match_players_inserted: number
  opp_players_patched: number
  kill_events_inserted: number
}

export type RehydrateErr = {
  ok: false
  status: number
  error: string
}

export async function rehydrateMatch(
  supabase: SupabaseClient,
  matchUuid: string
): Promise<RehydrateOk | RehydrateErr> {
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, match_id_helldock, henrik_id, team_id')
    .eq('id', matchUuid)
    .single()

  if (matchErr || !match) return { ok: false, status: 404, error: 'Match not found' }
  if (!match.henrik_id) {
    return { ok: false, status: 400, error: 'Match has no henrik_id — manual entry cannot be rehydrated' }
  }

  const { data: team } = await supabase
    .from('teams')
    .select('slug')
    .eq('id', match.team_id)
    .single()

  if (!team) return { ok: false, status: 404, error: 'Team not found for match' }

  const teamConfig = TEAM_CONFIGS[team.slug as keyof typeof TEAM_CONFIGS]
  if (!teamConfig) {
    return { ok: false, status: 400, error: `No team config for slug '${team.slug}'` }
  }

  const mainRiotId = `${teamConfig.mainAccount.name}#${teamConfig.mainAccount.tag}`
  const apiKey = process.env.HENRIKDEV_API_KEY ?? process.env.HENRIK_API_KEY ?? ''

  const raw = await fetchMatchByIdV4(match.henrik_id, teamConfig.mainAccount.region, apiKey)
  if (!raw || raw?.errors) {
    return {
      ok: false,
      status: 502,
      error: `Henrik fetch failed: ${JSON.stringify(raw?.errors ?? raw)}`,
    }
  }

  const xf = transformMatchToRows(raw, mainRiotId, teamConfig.roster, isPremierMatch(raw))
  if ('error' in xf) {
    return { ok: false, status: 422, error: xf.error }
  }

  // Player UUID lookup across all linked accounts (including alts).
  const { data: accountRows } = await supabase
    .from('player_accounts')
    .select('player_id, riot_name, riot_tag, puuid, players!inner(team_id)')
    .eq('players.team_id', match.team_id)

  const byPuuid = new Map<string, string>()
  const byRiotKey = new Map<string, string>()
  for (const a of (accountRows ?? []) as Array<{
    player_id: string
    riot_name: string
    riot_tag: string
    puuid: string | null
  }>) {
    byRiotKey.set(`${a.riot_name}#${a.riot_tag}`, a.player_id)
    if (a.puuid) byPuuid.set(a.puuid, a.player_id)
  }

  // Patch rounds by (match_id, round_num)
  let roundsPatched = 0
  for (const r of xf.rounds) {
    const { error } = await supabase
      .from('rounds')
      .update({
        half: r.half,
        side: r.side,
        our_econ: r.our_econ,
        their_econ: r.their_econ,
        round_type: r.round_type,
        site: r.site,
        outcome: r.outcome,
        first_blood: r.first_blood,
        fb_player: r.fb_player,
        fb_weapon: r.fb_weapon,
        planter: r.planter,
        defuser: r.defuser,
        fd_player: r.fd_player,
        was_traded: r.was_traded,
        clutch_type: r.clutch_type,
        clutch_player: r.clutch_player,
        mvp: r.mvp,
        setup: r.setup,
        plant_time_in_round: r.plant_time_in_round,
        defuse_time_in_round: r.defuse_time_in_round,
        our_econ_spent: r.our_econ_spent,
        their_econ_spent: r.their_econ_spent,
        our_ults_used: r.our_ults_used,
        their_ults_used: r.their_ults_used,
      })
      .eq('match_id', match.id)
      .eq('round_num', r.round_num)
    if (!error) roundsPatched++
  }

  // Replace kill_events for this match (delete + bulk insert)
  let killEventsInserted = 0
  await supabase.from('kill_events').delete().eq('match_id', match.id)
  if (xf.killEvents.length) {
    const { error: keErr } = await supabase
      .from('kill_events')
      .insert(xf.killEvents.map((k) => ({ ...k, match_id: match.id })))
    if (!keErr) killEventsInserted = xf.killEvents.length
  }

  // If the match has zero match_players (silent partial-import failure), INSERT
  // all 5 fresh instead of trying to UPDATE. Otherwise patch the existing rows.
  const { count: existingMpCount } = await supabase
    .from('match_players')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', match.id)

  let mpPatched = 0
  let mpInserted = 0

  if ((existingMpCount ?? 0) === 0 && xf.ourPlayers.length) {
    const rows = xf.ourPlayers.map((p) => {
      const { riot_key, ...rest } = p
      const playerId =
        (p.puuid ? byPuuid.get(p.puuid) : undefined) ?? byRiotKey.get(riot_key) ?? null
      return { ...rest, match_id: match.id, player_id: playerId }
    })
    const { error } = await supabase.from('match_players').insert(rows)
    if (error) {
      return {
        ok: false,
        status: 500,
        error: `match_players insert failed: ${error.message}`,
      }
    }
    mpInserted = rows.length
  } else {
    for (const p of xf.ourPlayers) {
      const playerId =
        (p.puuid ? byPuuid.get(p.puuid) : undefined) ?? byRiotKey.get(p.riot_key) ?? null
      if (!playerId) continue
      const { error } = await supabase
        .from('match_players')
        .update({
          puuid: p.puuid,
          riot_name: p.riot_name,
          riot_tag: p.riot_tag,
          agent: p.agent,
          role: p.role,
          k: p.k,
          d: p.d,
          a: p.a,
          acs: p.acs,
          plus_minus: p.plus_minus,
          plants: p.plants,
          defuses: p.defuses,
          fk: p.fk,
          fd: p.fd,
          two_k: p.two_k,
          three_k: p.three_k,
          four_k: p.four_k,
          aces: p.aces,
          clutches: p.clutches,
          clutch_1v2plus: p.clutch_1v2plus,
          hs: p.hs,
          bs: p.bs,
          ls: p.ls,
          damage_made: p.damage_made,
          damage_received: p.damage_received,
          adr: p.adr,
          ability_c: p.ability_c,
          ability_q: p.ability_q,
          ability_e: p.ability_e,
          ability_x: p.ability_x,
          rounds_afk: p.rounds_afk,
          friendly_fire_outgoing: p.friendly_fire_outgoing,
          friendly_fire_incoming: p.friendly_fire_incoming,
        })
        .eq('match_id', match.id)
        .eq('player_id', playerId)
      if (!error) mpPatched++
    }
  }

  // Patch opp_players by (match_id, riot_id_full)
  let oppPatched = 0
  for (const op of xf.oppPlayers) {
    const { error } = await supabase
      .from('opp_players')
      .update({
        opp_player_name: op.opp_player_name,
        agent: op.agent,
        k: op.k,
        d: op.d,
        a: op.a,
        acs: op.acs,
        fb: op.fb,
        plants: op.plants,
        defuses: op.defuses,
        hs: op.hs,
        bs: op.bs,
        ls: op.ls,
        damage_made: op.damage_made,
        damage_received: op.damage_received,
        adr: op.adr,
      })
      .eq('match_id', match.id)
      .eq('riot_id_full', op.riot_id_full)
    if (!error) oppPatched++
  }

  return {
    ok: true,
    match_id_helldock: match.match_id_helldock,
    rounds_patched: roundsPatched,
    match_players_patched: mpPatched,
    match_players_inserted: mpInserted,
    opp_players_patched: oppPatched,
    kill_events_inserted: killEventsInserted,
  }
}
