/**
 * Map parsed VLR data → Supabase pro_* tables.
 *
 * Idempotent: re-running on the same match deletes child rows then re-inserts.
 * Teams and players are upserted on (vlr_*_id) so historical references stay
 * stable across re-ingests.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { VlrMatch, VlrTeamRef, VlrPlayerRef, VlrEventMeta } from './types'

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function upsertTeam(
  sb: SupabaseClient,
  ref: VlrTeamRef
): Promise<string | null> {
  if (!ref.vlrTeamId) return null
  const { data, error } = await sb
    .from('pro_teams')
    .upsert(
      {
        vlr_team_id: ref.vlrTeamId,
        name: ref.name,
        tag: ref.tag,
        slug: ref.slug,
        url: ref.url || null,
      },
      { onConflict: 'vlr_team_id' }
    )
    .select('id')
    .single()
  if (error) {
    console.error(`upsertTeam(${ref.name}) error:`, error.message)
    return null
  }
  return data?.id ?? null
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function upsertEvent(
  sb: SupabaseClient,
  meta: VlrEventMeta,
  tier?: string
): Promise<string | null> {
  const { data, error } = await sb
    .from('pro_events')
    .upsert(
      {
        vlr_event_id: meta.vlrEventId,
        name: meta.name,
        region: meta.region,
        tier: tier ?? null,
        prize_pool: meta.prizePool,
        start_date: meta.startDate,
        end_date: meta.endDate,
        url: meta.url,
      },
      { onConflict: 'vlr_event_id' }
    )
    .select('id')
    .single()
  if (error) {
    console.error(`upsertEvent(${meta.name}) error:`, error.message)
    return null
  }
  return data?.id ?? null
}

// ─── Players ─────────────────────────────────────────────────────────────────

export async function upsertPlayer(
  sb: SupabaseClient,
  ref: VlrPlayerRef,
  currentTeamId: string | null
): Promise<string | null> {
  if (!ref.vlrPlayerId) {
    // No VLR player ID — best-effort find by ign, else insert without unique
    const { data: existing } = await sb
      .from('pro_players')
      .select('id')
      .eq('ign', ref.ign)
      .limit(1)
      .maybeSingle()
    if (existing?.id) return existing.id
    const { data, error } = await sb
      .from('pro_players')
      .insert({
        ign: ref.ign,
        country: ref.country,
        current_team_id: currentTeamId,
        url: ref.url,
      })
      .select('id')
      .single()
    if (error) {
      console.error(`insertPlayer(${ref.ign}) error:`, error.message)
      return null
    }
    return data?.id ?? null
  }

  const { data, error } = await sb
    .from('pro_players')
    .upsert(
      {
        vlr_player_id: ref.vlrPlayerId,
        ign: ref.ign,
        country: ref.country,
        current_team_id: currentTeamId,
        url: ref.url,
      },
      { onConflict: 'vlr_player_id' }
    )
    .select('id')
    .single()
  if (error) {
    console.error(`upsertPlayer(${ref.ign}) error:`, error.message)
    return null
  }
  return data?.id ?? null
}

// ─── Match ingest ────────────────────────────────────────────────────────────

export type IngestResult = {
  ok: boolean
  matchId?: string
  mapsInserted: number
  playersInserted: number
  roundsInserted: number
  error?: string
}

export async function ingestMatch(
  sb: SupabaseClient,
  m: VlrMatch
): Promise<IngestResult> {
  // Resolve team IDs
  const teamAId = await upsertTeam(sb, m.teamA)
  const teamBId = await upsertTeam(sb, m.teamB)
  if (!teamAId || !teamBId) {
    return {
      ok: false,
      mapsInserted: 0,
      playersInserted: 0,
      roundsInserted: 0,
      error: 'failed to resolve team ids',
    }
  }

  // Resolve event ID (optional — may be null)
  let eventId: string | null = null
  if (m.eventVlrId && m.eventName) {
    eventId = await upsertEvent(sb, {
      vlrEventId: m.eventVlrId,
      name: m.eventName,
      url: `https://www.vlr.gg/event/${m.eventVlrId}`,
      region: null,
      prizePool: null,
      startDate: null,
      endDate: null,
    })
  }

  // Upsert the match
  const winnerId = m.winnerSide === 'a' ? teamAId : m.winnerSide === 'b' ? teamBId : null
  const { data: matchRow, error: matchErr } = await sb
    .from('pro_matches')
    .upsert(
      {
        vlr_match_id: m.vlrMatchId,
        event_id: eventId,
        event_stage: m.eventStage,
        team_a_id: teamAId,
        team_b_id: teamBId,
        team_a_score: m.teamAScore,
        team_b_score: m.teamBScore,
        winner_team_id: winnerId,
        format: m.format,
        match_date: m.matchDate,
        match_datetime: m.matchDatetime,
        url: m.url,
        patch: m.patch,
        scraped_at: new Date().toISOString(),
      },
      { onConflict: 'vlr_match_id' }
    )
    .select('id')
    .single()
  if (matchErr || !matchRow?.id) {
    return {
      ok: false,
      mapsInserted: 0,
      playersInserted: 0,
      roundsInserted: 0,
      error: `match upsert: ${matchErr?.message}`,
    }
  }
  const matchId = matchRow.id

  // Wipe child rows for idempotency
  await sb.from('pro_map_results').delete().eq('match_id', matchId)
  // map_results CASCADE → pro_player_map_stats + pro_rounds

  let mapsInserted = 0
  let playersInserted = 0
  let roundsInserted = 0

  for (const map of m.maps) {
    const pickTeamId =
      map.pickedBy === 'a' ? teamAId : map.pickedBy === 'b' ? teamBId : null
    const mapWinnerId =
      map.winnerSide === 'a' ? teamAId : map.winnerSide === 'b' ? teamBId : null

    const { data: mapRow, error: mapErr } = await sb
      .from('pro_map_results')
      .insert({
        match_id: matchId,
        map_order: map.mapOrder,
        map_name: map.mapName,
        pick_team_id: pickTeamId,
        team_a_score: map.teamAScore,
        team_b_score: map.teamBScore,
        team_a_atk_score: map.teamAAtkScore,
        team_a_def_score: map.teamADefScore,
        team_b_atk_score: map.teamBAtkScore,
        team_b_def_score: map.teamBDefScore,
        team_a_start_side: map.teamAStartSide,
        winner_team_id: mapWinnerId,
        duration_minutes: map.durationMinutes,
      })
      .select('id')
      .single()
    if (mapErr || !mapRow?.id) {
      console.error(`map insert (order ${map.mapOrder}):`, mapErr?.message)
      continue
    }
    mapsInserted++
    const mapResultId = mapRow.id

    // Players
    if (map.players.length) {
      const playerRows = await Promise.all(
        map.players.map(async (p) => {
          const teamId = p.teamSide === 'a' ? teamAId : teamBId
          const playerId = await upsertPlayer(sb, p.player, teamId)
          return {
            map_result_id: mapResultId,
            player_id: playerId,
            team_id: teamId,
            ign: p.player.ign,
            agent: p.agent,
            rating: p.rating,
            acs: p.acs,
            k: p.k,
            d: p.d,
            a: p.a,
            plus_minus: p.plusMinus,
            kast: p.kast,
            adr: p.adr,
            hs_pct: p.hsPct,
            fk: p.fk,
            fd: p.fd,
            fk_fd_diff: p.fkFdDiff,
            acs_atk: p.acsAtk,
            acs_def: p.acsDef,
            k_atk: p.kAtk,
            k_def: p.kDef,
            d_atk: p.dAtk,
            d_def: p.dDef,
          }
        })
      )
      const { error: ppmsErr } = await sb.from('pro_player_map_stats').insert(playerRows)
      if (ppmsErr) {
        console.error(`ppms insert:`, ppmsErr.message)
      } else {
        playersInserted += playerRows.length
      }
    }

    // Rounds
    if (map.rounds.length) {
      const roundRows = map.rounds.map((r) => ({
        map_result_id: mapResultId,
        round_num: r.roundNum,
        half: r.half,
        winner_team_id: r.winnerSide === 'a' ? teamAId : teamBId,
        end_type: r.endType,
        plant_happened: r.plantHappened,
        team_a_side: r.teamASide,
        team_b_side: r.teamBSide,
      }))
      const { error: roundsErr } = await sb.from('pro_rounds').insert(roundRows)
      if (roundsErr) {
        console.error(`rounds insert:`, roundsErr.message)
      } else {
        roundsInserted += roundRows.length
      }
    }
  }

  return {
    ok: true,
    matchId,
    mapsInserted,
    playersInserted,
    roundsInserted,
  }
}
