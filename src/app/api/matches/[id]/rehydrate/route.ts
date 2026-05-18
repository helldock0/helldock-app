import { createClient } from '@/lib/supabase/server'
import { TEAM_CONFIGS } from '@/lib/teams'
import { fetchMatchByIdV4, isPremierMatch } from '@/lib/henrik/client'
import { transformMatchToRows } from '@/lib/henrik/transformers'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const matchUuid = params.id

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, match_id_helldock, henrik_id, team_id')
    .eq('id', matchUuid)
    .single()

  if (matchErr || !match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }
  if (!match.henrik_id) {
    return NextResponse.json({ error: 'Match has no henrik_id — manual entry cannot be rehydrated' }, { status: 400 })
  }

  const { data: team } = await supabase
    .from('teams')
    .select('slug')
    .eq('id', match.team_id)
    .single()

  if (!team) return NextResponse.json({ error: 'Team not found for match' }, { status: 404 })

  const teamConfig = TEAM_CONFIGS[team.slug]
  if (!teamConfig) return NextResponse.json({ error: `No team config for slug '${team.slug}'` }, { status: 400 })

  const mainRiotId = `${teamConfig.mainAccount.name}#${teamConfig.mainAccount.tag}`
  const apiKey = process.env.HENRIKDEV_API_KEY ?? ''

  const raw = await fetchMatchByIdV4(match.henrik_id, teamConfig.mainAccount.region, apiKey)
  if (!raw || raw?.errors) {
    return NextResponse.json(
      { error: `Henrik fetch failed: ${JSON.stringify(raw?.errors ?? raw)}` },
      { status: 502 }
    )
  }

  const xf = transformMatchToRows(raw, mainRiotId, teamConfig.roster, isPremierMatch(raw))
  if ('error' in xf) {
    return NextResponse.json({ error: xf.error }, { status: 422 })
  }

  // Player UUID lookup for our team
  const { data: teamPlayers } = await supabase
    .from('players')
    .select('id, riot_name, riot_tag')
    .eq('team_id', match.team_id)

  const playerLookup = new Map<string, string>(
    (teamPlayers ?? []).map((p: { id: string; riot_name: string; riot_tag: string }) => [
      `${p.riot_name}#${p.riot_tag}`,
      p.id,
    ])
  )

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

  // Patch match_players by (match_id, player_id). We DO NOT touch manual fields
  // (aim_score, decision_score, comms_score, notes, attendance).
  let mpPatched = 0
  for (const p of xf.ourPlayers) {
    const playerId = playerLookup.get(p.riot_key) ?? null
    if (!playerId) continue
    const { error } = await supabase
      .from('match_players')
      .update({
        puuid: p.puuid,
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

  return NextResponse.json({
    match_id_helldock: match.match_id_helldock,
    rounds_patched: roundsPatched,
    match_players_patched: mpPatched,
    opp_players_patched: oppPatched,
    kill_events_inserted: killEventsInserted,
  })
}
