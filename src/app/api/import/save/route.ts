import { createClient } from '@/lib/supabase/server'
import { TEAM_CONFIGS } from '@/lib/teams'
import { transformMatchToRows } from '@/lib/henrik/transformers'
import { isPremierMatch } from '@/lib/henrik/client'
import { NextResponse } from 'next/server'
import { notifyDiscordForMatch, baseUrlFromRequest } from '@/lib/discord'
import type { MatchPreview } from '../fetch/route'

function nextMatchIdHelldock(current: string | null): string {
  const num = current ? parseInt(current.replace('M', ''), 10) : 0
  return `M${String(num + 1).padStart(3, '0')}`
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamSlug, selectedMatches }: { teamSlug: string; selectedMatches: MatchPreview[] } =
    await req.json()

  const teamConfig = TEAM_CONFIGS[teamSlug]
  if (!teamConfig) return NextResponse.json({ error: 'Unknown team' }, { status: 400 })

  const mainRiotId = `${teamConfig.mainAccount.name}#${teamConfig.mainAccount.tag}`

  // Get team DB id
  const { data: teamRow } = await supabase.from('teams').select('id').eq('slug', teamSlug).single()
  const teamId = teamRow?.id
  if (!teamId) return NextResponse.json({ error: 'Team not found in DB' }, { status: 404 })

  // Player resolution: build PUUID + riot_id lookups across all accounts (including alts)
  // owned by this team's players. PUUID is preferred — stable even when Riot ID changes.
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

  // Get current max match ID
  const { data: maxRow } = await supabase
    .from('matches')
    .select('match_id_helldock')
    .order('match_id_helldock', { ascending: false })
    .limit(1)
  let currentMatchId: string | null = maxRow?.[0]?.match_id_helldock ?? null

  // Sort selected matches oldest-first so IDs are assigned chronologically
  const sorted = [...selectedMatches].sort((a, b) => a.date.localeCompare(b.date))

  const results: { henrik_id: string; match_id: string; status: 'saved' | 'error'; error?: string }[] = []

  for (const preview of sorted) {
    const xf = transformMatchToRows(
      preview.raw_match,
      mainRiotId,
      teamConfig.roster,
      isPremierMatch(preview.raw_match)
    )

    if ('error' in xf) {
      results.push({ henrik_id: preview.henrik_id, match_id: '', status: 'error', error: xf.error })
      continue
    }

    currentMatchId = nextMatchIdHelldock(currentMatchId)

    // Compute session_num: how many matches already in DB for this team on this date
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('match_date', xf.matchData.match_date)

    const sessionNum = (count ?? 0) + 1

    // Insert match
    const { data: insertedMatch, error: matchError } = await supabase
      .from('matches')
      .insert({
        ...xf.matchData,
        match_id_helldock: currentMatchId,
        team_id: teamId,
        session_num: sessionNum,
      })
      .select('id')
      .single()

    if (matchError || !insertedMatch) {
      results.push({
        henrik_id: preview.henrik_id,
        match_id: currentMatchId,
        status: 'error',
        error: matchError?.message ?? 'Match insert failed',
      })
      continue
    }

    const matchUUID = insertedMatch.id

    // Insert rounds
    if (xf.rounds.length) {
      const { error: rdErr } = await supabase
        .from('rounds')
        .insert(xf.rounds.map((r) => ({ ...r, match_id: matchUUID })))
      if (rdErr) {
        results.push({
          henrik_id: preview.henrik_id,
          match_id: currentMatchId,
          status: 'error',
          error: `rounds insert failed: ${rdErr.message}`,
        })
        continue
      }
    }

    // Insert our players. riot_name/riot_tag are now persisted so that orphaned rows
    // (player_id IS NULL) can still be identified and later linked to a player via the
    // alt-account UI in the match detail page.
    if (xf.ourPlayers.length) {
      const { error: mpErr } = await supabase.from('match_players').insert(
        xf.ourPlayers.map((p) => {
          const { riot_key, ...rest } = p
          const playerId =
            (p.puuid ? byPuuid.get(p.puuid) : undefined) ??
            byRiotKey.get(riot_key) ??
            null
          return {
            ...rest,
            match_id: matchUUID,
            player_id: playerId,
          }
        })
      )
      if (mpErr) {
        results.push({
          henrik_id: preview.henrik_id,
          match_id: currentMatchId,
          status: 'error',
          error: `match_players insert failed: ${mpErr.message}`,
        })
        continue
      }
    }

    // Insert opp players
    if (xf.oppPlayers.length) {
      const { error: oppErr } = await supabase
        .from('opp_players')
        .insert(xf.oppPlayers.map((p) => ({ ...p, match_id: matchUUID })))
      if (oppErr) {
        results.push({
          henrik_id: preview.henrik_id,
          match_id: currentMatchId,
          status: 'error',
          error: `opp_players insert failed: ${oppErr.message}`,
        })
        continue
      }
    }

    // Insert kill_events (one row per kill across all rounds)
    if (xf.killEvents.length) {
      await supabase.from('kill_events').insert(
        xf.killEvents.map((k) => ({ ...k, match_id: matchUUID }))
      )
    }

    results.push({ henrik_id: preview.henrik_id, match_id: currentMatchId, status: 'saved' })

    // Fire-and-forget Discord notification — never throws, never blocks.
    await notifyDiscordForMatch(supabase, teamId, matchUUID, baseUrlFromRequest(req))
  }

  const saved = results.filter((r) => r.status === 'saved').length
  const errors = results.filter((r) => r.status === 'error')

  return NextResponse.json({ saved, errors, results })
}
