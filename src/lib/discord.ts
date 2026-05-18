// Discord webhook helper.
//
// Fire-and-forget posts to a per-team webhook URL stored on `teams.discord_webhook_url`.
// All network errors are caught and logged server-side so a bad/expired webhook
// never rolls back the match insert that triggered it.

export type DiscordMatchSummary = {
  /** Helldock display ID like "M027" */
  matchIdHelldock: string
  /** Full URL to the match detail page */
  matchUrl: string
  /** "Lotus" etc. */
  mapName: string | null
  /** "Scrylla" / "Hydra" display name */
  teamName: string
  /** "Team Nexus" */
  opponentName: string | null
  ourScore: number | null
  oppScore: number | null
  /** "W" | "L" | null */
  result: string | null
  /** Most recent top fragger summary, optional */
  topFragger: { name: string; acs: number | null; kills: number | null; deaths: number | null } | null
  /** Round totals broken out by side, optional */
  attWins: number | null
  attLosses: number | null
  defWins: number | null
  defLosses: number | null
  /** Plant rate on ATT side (0-100), optional */
  plantRatePct: number | null
}

export function buildMatchEmbed(s: DiscordMatchSummary) {
  const resultEmoji = s.result === 'W' ? '🏆' : s.result === 'L' ? '💀' : '🎯'
  const resultColor = s.result === 'W' ? 0xffd700 : s.result === 'L' ? 0xdc143c : 0x6b7280
  const scoreStr =
    s.ourScore != null && s.oppScore != null ? `${s.ourScore}–${s.oppScore}` : '—'
  const headline = `${resultEmoji} ${s.mapName ?? 'Unknown'} ${scoreStr} ${s.result ?? ''} vs ${s.opponentName ?? 'Unknown'}`

  const fields: { name: string; value: string; inline?: boolean }[] = []
  if (s.topFragger) {
    const kd =
      s.topFragger.kills != null && s.topFragger.deaths != null
        ? ` · ${s.topFragger.kills}-${s.topFragger.deaths}`
        : ''
    fields.push({
      name: 'Top fragger',
      value: `**${s.topFragger.name}** · ${s.topFragger.acs ?? '—'} ACS${kd}`,
      inline: false,
    })
  }
  if (s.attWins != null && s.attLosses != null) {
    fields.push({
      name: 'ATT',
      value: `${s.attWins}-${s.attLosses}`,
      inline: true,
    })
  }
  if (s.defWins != null && s.defLosses != null) {
    fields.push({
      name: 'DEF',
      value: `${s.defWins}-${s.defLosses}`,
      inline: true,
    })
  }
  if (s.plantRatePct != null) {
    fields.push({
      name: 'Plant rate',
      value: `${s.plantRatePct}%`,
      inline: true,
    })
  }

  return {
    username: 'Helldock',
    embeds: [
      {
        title: headline,
        url: s.matchUrl,
        color: resultColor,
        fields,
        footer: { text: `${s.teamName} · ${s.matchIdHelldock}` },
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

/**
 * POST a match summary embed to a Discord channel webhook. Never throws — logs
 * to server console on failure so the caller's insert path is untouched.
 */
export async function postMatchToDiscord(
  webhookUrl: string,
  summary: DiscordMatchSummary
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildMatchEmbed(summary)),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[discord] webhook ${res.status}: ${text.slice(0, 200)}`)
      return { ok: false, status: res.status, error: text.slice(0, 200) }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    console.warn(`[discord] webhook failed: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/**
 * Fetch a freshly-inserted match's data and post it to the team's Discord
 * webhook, if configured. Fire-and-forget — never throws. Safe to call from
 * insert pipelines without awaiting too hard.
 */
export async function notifyDiscordForMatch(
  supabase: SupabaseLike,
  teamId: string,
  matchUUID: string,
  baseUrl: string
): Promise<void> {
  try {
    const { data: team } = await supabase
      .from('teams')
      .select('name, discord_webhook_url')
      .eq('id', teamId)
      .single()
    if (!team?.discord_webhook_url) return

    const { data: match } = await supabase
      .from('matches')
      .select(
        'match_id_helldock, map_name, opponent_name, our_score, opp_score, result'
      )
      .eq('id', matchUUID)
      .single()
    if (!match) return

    // Top fragger by ACS
    const { data: mp } = await supabase
      .from('match_players')
      .select('k, d, acs, player:players(display_name)')
      .eq('match_id', matchUUID)
    let topFragger: DiscordMatchSummary['topFragger'] = null
    for (const row of (mp ?? []) as Array<{
      k: number | null
      d: number | null
      acs: number | null
      player: { display_name: string } | null
    }>) {
      if (row.acs == null || !row.player) continue
      if (!topFragger || row.acs > (topFragger.acs ?? 0)) {
        topFragger = {
          name: row.player.display_name,
          acs: row.acs,
          kills: row.k,
          deaths: row.d,
        }
      }
    }

    // ATT/DEF round split + plant rate (ATT)
    const { data: rounds } = await supabase
      .from('rounds')
      .select('side, outcome, plant_time_in_round')
      .eq('match_id', matchUUID)
    let attW = 0,
      attL = 0,
      defW = 0,
      defL = 0,
      attTotal = 0,
      attPlants = 0
    let anyOutcome = false
    for (const r of (rounds ?? []) as Array<{
      side: string | null
      outcome: string | null
      plant_time_in_round: number | null
    }>) {
      if (r.outcome) anyOutcome = true
      if (r.side === 'Attack') {
        if (r.outcome === 'W') attW++
        else if (r.outcome === 'L') attL++
        if (r.outcome) {
          attTotal++
          if (r.plant_time_in_round != null) attPlants++
        }
      } else if (r.side === 'Defense') {
        if (r.outcome === 'W') defW++
        else if (r.outcome === 'L') defL++
      }
    }

    const summary: DiscordMatchSummary = {
      matchIdHelldock: match.match_id_helldock,
      matchUrl: `${baseUrl.replace(/\/+$/, '')}/matches/${match.match_id_helldock}`,
      mapName: match.map_name,
      teamName: team.name,
      opponentName: match.opponent_name,
      ourScore: match.our_score,
      oppScore: match.opp_score,
      result: match.result,
      topFragger,
      attWins: anyOutcome && attW + attL > 0 ? attW : null,
      attLosses: anyOutcome && attW + attL > 0 ? attL : null,
      defWins: anyOutcome && defW + defL > 0 ? defW : null,
      defLosses: anyOutcome && defW + defL > 0 ? defL : null,
      plantRatePct:
        attTotal > 0 ? Math.round((attPlants / attTotal) * 100) : null,
    }

    await postMatchToDiscord(team.discord_webhook_url, summary)
  } catch (e) {
    console.warn(
      `[discord] notify failed: ${e instanceof Error ? e.message : String(e)}`
    )
  }
}

/** Derive the public base URL from the incoming request, with env fallback. */
export function baseUrlFromRequest(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env
  const proto =
    req.headers.get('x-forwarded-proto') ?? (req.url.startsWith('https') ? 'https' : 'http')
  const host = req.headers.get('host') ?? req.headers.get('x-forwarded-host') ?? 'localhost:3000'
  return `${proto}://${host}`
}
