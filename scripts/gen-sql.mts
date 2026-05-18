/**
 * Reads scripts/_out/rehydrate.json and emits SQL UPDATE statements
 * for rounds, match_players, opp_players. Also needs a player_lookup
 * (riot_key → player_id UUID per team) — fetched here from the matches.json input
 * is unnecessary, so we instead fetch from DB via stdin-passed lookup.
 *
 * Output: scripts/_out/rehydrate.sql
 */
import { readFileSync, writeFileSync } from 'node:fs'

type RehydrateRow = {
  id: string
  match_id_helldock: string
  team_slug?: string
  status: 'ok' | 'error'
  rounds?: any[]
  ourPlayers?: any[]
  oppPlayers?: any[]
  killEvents?: any[]
}

const json: RehydrateRow[] = JSON.parse(readFileSync('scripts/_out/rehydrate.json', 'utf8'))
const lookup: Record<string, Record<string, string>> =
  JSON.parse(readFileSync('scripts/_in/player_lookup.json', 'utf8'))
// shape: { [team_slug]: { [riot_key]: player_id_uuid } }

function sqlStr(v: string | null | undefined): string {
  if (v == null) return 'NULL'
  return "'" + String(v).replace(/'/g, "''") + "'"
}
function sqlNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return 'NULL'
  return String(v)
}
function sqlBool(v: boolean | null | undefined): string {
  if (v == null) return 'NULL'
  return v ? 'TRUE' : 'FALSE'
}

const out: string[] = []
let roundCount = 0
let mpCount = 0
let oppCount = 0
let keCount = 0
let skipped = 0

for (const m of json) {
  if (m.status !== 'ok' || !m.rounds || !m.ourPlayers || !m.oppPlayers) continue
  const matchId = m.id
  const teamRoster = lookup[m.team_slug ?? ''] ?? {}

  // Rounds
  for (const r of m.rounds) {
    out.push(`UPDATE rounds SET
  half=${sqlStr(r.half)}, side=${sqlStr(r.side)},
  our_econ=${sqlNum(r.our_econ)}, their_econ=${sqlNum(r.their_econ)},
  round_type=${sqlStr(r.round_type)}, site=${sqlStr(r.site)},
  outcome=${sqlStr(r.outcome)}, first_blood=${sqlStr(r.first_blood)},
  fb_player=${sqlStr(r.fb_player)}, fb_weapon=${sqlStr(r.fb_weapon)},
  planter=${sqlStr(r.planter)}, defuser=${sqlStr(r.defuser)},
  fd_player=${sqlStr(r.fd_player)}, was_traded=${sqlBool(r.was_traded)},
  clutch_type=${sqlStr(r.clutch_type)}, clutch_player=${sqlStr(r.clutch_player)},
  mvp=${sqlStr(r.mvp)}, setup=${sqlStr(r.setup)},
  plant_time_in_round=${sqlNum(r.plant_time_in_round)},
  defuse_time_in_round=${sqlNum(r.defuse_time_in_round)},
  our_econ_spent=${sqlNum(r.our_econ_spent)},
  their_econ_spent=${sqlNum(r.their_econ_spent)},
  our_ults_used=${sqlNum(r.our_ults_used)},
  their_ults_used=${sqlNum(r.their_ults_used)}
WHERE match_id=${sqlStr(matchId)} AND round_num=${sqlNum(r.round_num)};`)
    roundCount++
  }

  // Match players
  for (const p of m.ourPlayers) {
    const playerId = teamRoster[p.riot_key]
    if (!playerId) {
      skipped++
      out.push(`-- SKIP match_player: no UUID for ${p.riot_key} in team ${m.team_slug} (match ${m.match_id_helldock})`)
      continue
    }
    out.push(`UPDATE match_players SET
  agent=${sqlStr(p.agent)}, role=${sqlStr(p.role)},
  k=${sqlNum(p.k)}, d=${sqlNum(p.d)}, a=${sqlNum(p.a)}, acs=${sqlNum(p.acs)}, plus_minus=${sqlNum(p.plus_minus)},
  plants=${sqlNum(p.plants)}, defuses=${sqlNum(p.defuses)},
  fk=${sqlNum(p.fk)}, fd=${sqlNum(p.fd)},
  two_k=${sqlNum(p.two_k)}, three_k=${sqlNum(p.three_k)}, four_k=${sqlNum(p.four_k)}, aces=${sqlNum(p.aces)},
  clutches=${sqlNum(p.clutches)}, clutch_1v2plus=${sqlNum(p.clutch_1v2plus)},
  hs=${sqlNum(p.hs)}, bs=${sqlNum(p.bs)}, ls=${sqlNum(p.ls)},
  damage_made=${sqlNum(p.damage_made)}, damage_received=${sqlNum(p.damage_received)}, adr=${sqlNum(p.adr)},
  ability_c=${sqlNum(p.ability_c)}, ability_q=${sqlNum(p.ability_q)}, ability_e=${sqlNum(p.ability_e)}, ability_x=${sqlNum(p.ability_x)},
  rounds_afk=${sqlNum(p.rounds_afk)},
  friendly_fire_outgoing=${sqlNum(p.friendly_fire_outgoing)},
  friendly_fire_incoming=${sqlNum(p.friendly_fire_incoming)}
WHERE match_id=${sqlStr(matchId)} AND player_id=${sqlStr(playerId)};`)
    mpCount++
  }

  // Opp players
  for (const op of m.oppPlayers) {
    out.push(`UPDATE opp_players SET
  opp_player_name=${sqlStr(op.opp_player_name)}, agent=${sqlStr(op.agent)},
  k=${sqlNum(op.k)}, d=${sqlNum(op.d)}, a=${sqlNum(op.a)}, acs=${sqlNum(op.acs)},
  fb=${sqlNum(op.fb)}, plants=${sqlNum(op.plants)}, defuses=${sqlNum(op.defuses)},
  hs=${sqlNum(op.hs)}, bs=${sqlNum(op.bs)}, ls=${sqlNum(op.ls)},
  damage_made=${sqlNum(op.damage_made)}, damage_received=${sqlNum(op.damage_received)}, adr=${sqlNum(op.adr)}
WHERE match_id=${sqlStr(matchId)} AND riot_id_full=${sqlStr(op.riot_id_full)};`)
    oppCount++
  }

  // Kill events — wipe existing rows for this match, then bulk-insert.
  if (m.killEvents && m.killEvents.length > 0) {
    out.push(`DELETE FROM kill_events WHERE match_id=${sqlStr(matchId)};`)
    const valuesRows = m.killEvents
      .map(
        (k) =>
          `(${sqlStr(matchId)},${sqlNum(k.round_num)},${sqlNum(k.ts_in_round_ms)},${sqlStr(k.killer_puuid)},${sqlStr(k.victim_puuid)},${sqlBool(k.killer_is_ours)},${sqlStr(k.weapon_name)},${sqlBool(k.headshot)},${sqlNum(k.killer_x)},${sqlNum(k.killer_y)},${sqlNum(k.victim_x)},${sqlNum(k.victim_y)},${sqlBool(k.is_first_blood)})`
      )
      .join(',\n  ')
    out.push(`INSERT INTO kill_events (match_id, round_num, ts_in_round_ms, killer_puuid, victim_puuid, killer_is_ours, weapon_name, headshot, killer_x, killer_y, victim_x, victim_y, is_first_blood) VALUES
  ${valuesRows};`)
    keCount += m.killEvents.length
  }
}

writeFileSync('scripts/_out/rehydrate.sql', out.join('\n'))
process.stderr.write(
  `Generated ${roundCount} round UPDATEs, ${mpCount} match_player UPDATEs, ${oppCount} opp_player UPDATEs, ${keCount} kill_event rows (${skipped} skipped)\n`
)
process.stderr.write(`Wrote → scripts/_out/rehydrate.sql\n`)
