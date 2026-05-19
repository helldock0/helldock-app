import type { SupabaseClient } from '@supabase/supabase-js'
import { TEAM_CONFIGS } from '@/lib/teams'
import { fetchMatchByIdV4, isPremierMatch } from '@/lib/henrik/client'
import { transformMatchToRows } from '@/lib/henrik/transformers'
import { notifyDiscordForMatch } from '@/lib/discord'

export type IngestResult =
  | { status: 'ingested'; helldockId: string; matchUUID: string }
  | { status: 'duplicate'; helldockId: string; matchUUID: string }
  | { status: 'error'; error: string }

export type IngestSource = 'manual_import' | 'capture_agent'

export type IngestOpts = {
  henrikId: string
  teamSlug: string
  /** Optional pre-fetched V4 match payload. Save route has it; capture route fetches via Henrik. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawMatch?: any
  source: IngestSource
  supabase: SupabaseClient
  /** Base URL used by Discord embed match links. */
  baseUrl: string
}

function nextMatchIdHelldock(current: string | null): string {
  const num = current ? parseInt(current.replace('M', ''), 10) : 0
  return `M${String(num + 1).padStart(3, '0')}`
}

/**
 * Validate → transform → insert (match + rounds + match_players + opp_players + kill_events)
 * → fire Discord webhook. Idempotent via the `matches.henrik_id` unique constraint:
 * a second call with the same henrikId returns `{ status: 'duplicate' }` without
 * mutating anything.
 *
 * Race-tolerant: if two callers grab the same next match_id_helldock, the loser
 * retries (up to 3 times) before giving up. If two callers race the same henrikId,
 * the loser surfaces the winner's row as `duplicate`.
 */
export async function ingestMatch(opts: IngestOpts): Promise<IngestResult> {
  const { henrikId, teamSlug, supabase, baseUrl } = opts

  const teamConfig = TEAM_CONFIGS[teamSlug]
  if (!teamConfig) return { status: 'error', error: `Unknown team slug: ${teamSlug}` }

  // Fast-path dedupe by henrik_id (before fetching anything from Henrik)
  {
    const { data: existing } = await supabase
      .from('matches')
      .select('id, match_id_helldock')
      .eq('henrik_id', henrikId)
      .maybeSingle()
    if (existing) {
      return {
        status: 'duplicate',
        helldockId: existing.match_id_helldock,
        matchUUID: existing.id,
      }
    }
  }

  // Pull raw match from Henrik if caller didn't supply one (capture-agent path).
  let rawMatch = opts.rawMatch
  if (!rawMatch) {
    const result = await fetchMatchByIdV4(henrikId, teamConfig.mainAccount.region)
    if (!result?.metadata) {
      const errMsg =
        result?.errors?.[0]?.message ??
        (typeof result?.status === 'number' ? `HTTP ${result.status}` : 'unknown')
      return { status: 'error', error: `Henrik V4 fetch failed: ${errMsg}` }
    }
    rawMatch = result
  }

  // Team UUID lookup
  const { data: teamRow } = await supabase
    .from('teams')
    .select('id')
    .eq('slug', teamSlug)
    .single()
  const teamId = teamRow?.id
  if (!teamId) return { status: 'error', error: 'Team not found in DB' }

  // Build player_account lookup maps so transformer outputs get mapped to player_id.
  // PUUID is preferred (stable across riot-id rename); riot_key is the fallback.
  const { data: accountRows } = await supabase
    .from('player_accounts')
    .select('player_id, riot_name, riot_tag, puuid, players!inner(team_id)')
    .eq('players.team_id', teamId)

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

  // Transform
  const mainRiotId = `${teamConfig.mainAccount.name}#${teamConfig.mainAccount.tag}`
  const xf = transformMatchToRows(
    rawMatch,
    mainRiotId,
    teamConfig.roster,
    isPremierMatch(rawMatch)
  )
  if ('error' in xf) return { status: 'error', error: xf.error }

  // Compute next helldock ID + session_num
  const { data: maxRow } = await supabase
    .from('matches')
    .select('match_id_helldock')
    .order('match_id_helldock', { ascending: false })
    .limit(1)
  const currentMatchId: string | null = maxRow?.[0]?.match_id_helldock ?? null

  const { count } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('match_date', xf.matchData.match_date)
  const sessionNum = (count ?? 0) + 1

  // Insert match with retry on match_id_helldock collision; on henrik_id collision
  // (race against another caller) surface the winner as duplicate.
  let matchUUID = ''
  let assignedHelldockId = ''
  let attemptId = nextMatchIdHelldock(currentMatchId)
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('matches')
      .insert({
        ...xf.matchData,
        match_id_helldock: attemptId,
        team_id: teamId,
        session_num: sessionNum,
      })
      .select('id')
      .single()

    if (!error && data) {
      matchUUID = data.id
      assignedHelldockId = attemptId
      break
    }

    const msg = error?.message ?? ''
    const isUnique = error?.code === '23505'
    if (isUnique && msg.includes('match_id_helldock')) {
      attemptId = nextMatchIdHelldock(attemptId)
      continue
    }
    if (isUnique && msg.includes('henrik_id')) {
      const { data: dupe } = await supabase
        .from('matches')
        .select('id, match_id_helldock')
        .eq('henrik_id', henrikId)
        .maybeSingle()
      if (dupe) {
        return {
          status: 'duplicate',
          helldockId: dupe.match_id_helldock,
          matchUUID: dupe.id,
        }
      }
    }
    return { status: 'error', error: msg || 'Match insert failed' }
  }
  if (!matchUUID) {
    return { status: 'error', error: 'Match insert: helldock-id collision retries exhausted' }
  }

  // Rounds
  if (xf.rounds.length) {
    const { error: rdErr } = await supabase
      .from('rounds')
      .insert(xf.rounds.map((r) => ({ ...r, match_id: matchUUID })))
    if (rdErr) return { status: 'error', error: `rounds insert: ${rdErr.message}` }
  }

  // match_players — resolve player_id from puuid (preferred) or riot_key
  if (xf.ourPlayers.length) {
    const { error: mpErr } = await supabase.from('match_players').insert(
      xf.ourPlayers.map((p) => {
        const { riot_key, ...rest } = p
        const playerId =
          (p.puuid ? byPuuid.get(p.puuid) : undefined) ??
          byRiotKey.get(riot_key) ??
          null
        return { ...rest, match_id: matchUUID, player_id: playerId }
      })
    )
    if (mpErr) return { status: 'error', error: `match_players insert: ${mpErr.message}` }
  }

  // opp_players
  if (xf.oppPlayers.length) {
    const { error: oppErr } = await supabase
      .from('opp_players')
      .insert(xf.oppPlayers.map((p) => ({ ...p, match_id: matchUUID })))
    if (oppErr) return { status: 'error', error: `opp_players insert: ${oppErr.message}` }
  }

  // kill_events — fire-and-forget like the original save route
  if (xf.killEvents.length) {
    await supabase.from('kill_events').insert(
      xf.killEvents.map((k) => ({ ...k, match_id: matchUUID }))
    )
  }

  // Discord (fire-and-forget; never throws)
  await notifyDiscordForMatch(supabase, teamId, matchUUID, baseUrl)

  return { status: 'ingested', helldockId: assignedHelldockId, matchUUID }
}
