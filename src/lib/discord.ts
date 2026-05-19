// Discord webhook helper.
//
// Posts a tactical-breakdown embed to a per-team webhook URL stored on
// `teams.discord_webhook_url`. When kill_events exist for the match, also
// attaches a server-rendered kill-heatmap PNG so the recap is self-contained
// in the Discord channel. All network failures are swallowed — a bad webhook
// never rolls back the match insert that triggered it.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeTacticalBreakdown,
  computeStreakForMatch,
  computeMapHistory,
  computePlayerAcsDelta,
  type TacticalBreakdown,
  type StreakForMatch,
  type MapHistorySnapshot,
  type PlayerDelta,
  type RoundForBreakdown,
} from '@/lib/discord-compute'
import {
  renderMatchHeatmapPng,
  type HeatmapKillEvent,
} from '@/lib/discord-heatmap'

export type DiscordMatchSummary = {
  // ── header ──
  matchIdHelldock: string
  matchUrl: string
  mapName: string | null
  teamName: string
  opponentName: string | null
  ourScore: number | null
  oppScore: number | null
  result: 'W' | 'L' | null

  // ── tactical ──
  tactical: TacticalBreakdown

  // ── comparisons ──
  streak: StreakForMatch | null
  mapHistory: MapHistorySnapshot | null
  playerDeltas: PlayerDelta[] | null

  // ── heatmap (set only when image is attached) ──
  heatmapPng: Buffer | null
}

// ── Embed builder ────────────────────────────────────────────────────────────

type EmbedField = { name: string; value: string; inline?: boolean }

export function buildMatchEmbed(s: DiscordMatchSummary) {
  const resultEmoji = s.result === 'W' ? '🏆' : s.result === 'L' ? '💀' : '🎯'
  const resultColor = s.result === 'W' ? 0xffd700 : s.result === 'L' ? 0xdc143c : 0x6b7280
  const scoreStr =
    s.ourScore != null && s.oppScore != null ? `${s.ourScore}–${s.oppScore}` : '—'
  const title = `${resultEmoji} ${s.mapName ?? 'Unknown'} ${scoreStr} ${s.result ?? ''} vs ${s.opponentName ?? 'Unknown'}`

  const description = buildFormLine(s.streak, s.mapHistory)

  const fields: EmbedField[] = []
  const t = s.tactical

  // Halves + pistol — one row of inline fields.
  if (t.halves) {
    const otStr = t.halves.ot ? ` · OT ${t.halves.ot.w}-${t.halves.ot.l}` : ''
    fields.push({
      name: 'Halves',
      value: `H1 ${t.halves.h1.w}-${t.halves.h1.l} · H2 ${t.halves.h2.w}-${t.halves.h2.l}${otStr}`,
      inline: true,
    })
  }
  if (t.pistol) {
    fields.push({
      name: 'Pistol',
      value: `${t.pistol.w}-${t.pistol.l}`,
      inline: true,
    })
  }
  // Spacer to balance the row if Halves+Pistol are odd
  if (t.halves && t.pistol) {
    fields.push({ name: '​', value: '​', inline: true })
  }

  // ATT / DEF side stat blocks — inline, side by side.
  if (t.att) {
    const parts = [`${t.att.w}-${t.att.l}`]
    if (t.att.plantRatePct != null) parts.push(`plant ${t.att.plantRatePct}%`)
    if (t.att.avgPlantSec != null) parts.push(`avg ${t.att.avgPlantSec}s`)
    fields.push({ name: 'ATT', value: parts.join(' · '), inline: true })
  }
  if (t.def) {
    const parts = [`${t.def.w}-${t.def.l}`]
    if (t.def.defuseRatePct != null) parts.push(`defuse ${t.def.defuseRatePct}%`)
    if (t.def.avgDefuseSec != null) parts.push(`avg ${t.def.avgDefuseSec}s`)
    fields.push({ name: 'DEF', value: parts.join(' · '), inline: true })
  }
  if (t.att && t.def) {
    fields.push({ name: '​', value: '​', inline: true })
  }

  // Buy types — full-width line.
  if (t.byBuyType) {
    fields.push({
      name: 'Buy types',
      value: t.byBuyType.map((b) => `${b.type} ${b.w}-${b.l}`).join(' · '),
      inline: false,
    })
  }

  // Sites — full-width line with win pct.
  if (t.sites) {
    const parts: string[] = []
    for (const k of ['A', 'B', 'C'] as const) {
      const s2 = t.sites[k]
      if (s2.total > 0) {
        const wp = Math.round((s2.wins / s2.total) * 100)
        parts.push(`${k} ${s2.wins}/${s2.total} (${wp}%)`)
      }
    }
    if (parts.length) {
      fields.push({ name: 'Sites', value: parts.join(' · '), inline: false })
    }
  }

  // Ults
  if (t.ults) {
    fields.push({
      name: 'Ults used',
      value: `${t.ults.us} us · ${t.ults.them} them`,
      inline: true,
    })
  }

  // Players — code block for monospace alignment.
  if (s.playerDeltas && s.playerDeltas.length) {
    fields.push({
      name: 'Players (ACS vs avg)',
      value: '```\n' + formatPlayerBlock(s.playerDeltas) + '\n```',
      inline: false,
    })
  }

  const embed: {
    title: string
    url: string
    color: number
    description?: string
    fields: EmbedField[]
    footer: { text: string }
    timestamp: string
    image?: { url: string }
  } = {
    title,
    url: s.matchUrl,
    color: resultColor,
    fields,
    footer: { text: `${s.teamName} · ${s.matchIdHelldock}` },
    timestamp: new Date().toISOString(),
  }
  if (description) embed.description = description
  if (s.heatmapPng) embed.image = { url: 'attachment://heatmap.png' }

  return { username: 'Helldock', embeds: [embed] }
}

function buildFormLine(
  streak: StreakForMatch | null,
  mapHistory: MapHistorySnapshot | null
): string | null {
  const parts: string[] = []
  if (streak) {
    const emoji = streak.kind === 'W' ? '🔥' : '🧊'
    if (streak.length >= 2) {
      parts.push(`${emoji} ${streak.length}${streak.kind} in a row`)
    } else {
      // Single match — show as "1st W" / "1st L" (the new streak just started)
      parts.push(`${emoji} 1st ${streak.kind}`)
    }
  }
  if (mapHistory && mapHistory.total > 0) {
    const wp = Math.round((mapHistory.wins / mapHistory.total) * 100)
    parts.push(
      `${mapHistory.mapName} ${mapHistory.wins}-${mapHistory.total - mapHistory.wins} ${mapHistory.windowLabel} (${wp}%)`
    )
  }
  return parts.length ? `Form: ${parts.join(' · ')}` : null
}

function formatPlayerBlock(deltas: PlayerDelta[]): string {
  const maxName = Math.max(...deltas.map((d) => d.name.length))
  return deltas
    .map((d) => {
      const name = d.name.padEnd(maxName)
      const acs = d.acs != null ? String(d.acs).padStart(4) : '   —'
      let delta = '      '
      if (d.acsDelta != null) {
        const sign = d.acsDelta > 0 ? '+' : d.acsDelta < 0 ? '−' : '±'
        const abs = Math.abs(d.acsDelta)
        delta = `  (${sign}${String(abs).padStart(2)})`
      }
      return `${name}  ${acs}${delta}`
    })
    .join('\n')
}

// ── Webhook posters ──────────────────────────────────────────────────────────

/**
 * Plain JSON post — used by the test route and by live posts when there's no
 * heatmap to attach. Never throws.
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
    console.warn(
      `[discord] webhook failed: ${e instanceof Error ? e.message : String(e)}`
    )
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Multipart post with a PNG heatmap attachment. The embed references the
 * attachment via `attachment://heatmap.png`. Never throws.
 */
async function postMatchToDiscordMultipart(
  webhookUrl: string,
  summary: DiscordMatchSummary,
  pngBuffer: Buffer
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const form = new FormData()
    form.append(
      'payload_json',
      new Blob([JSON.stringify(buildMatchEmbed(summary))], {
        type: 'application/json',
      })
    )
    // Node 18+ Blob accepts Uint8Array; convert from Buffer.
    const pngBlob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' })
    form.append('files[0]', pngBlob, 'heatmap.png')

    const res = await fetch(webhookUrl, { method: 'POST', body: form })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(
        `[discord] multipart webhook ${res.status}: ${text.slice(0, 200)}`
      )
      return { ok: false, status: res.status, error: text.slice(0, 200) }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    console.warn(
      `[discord] multipart webhook failed: ${e instanceof Error ? e.message : String(e)}`
    )
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── notifyDiscordForMatch ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = SupabaseClient | any

/**
 * Fetch a freshly-inserted match's data, compute the tactical breakdown +
 * comparison signals, render the kill-heatmap PNG if kill_events exist, and
 * post it to the team's Discord webhook. Fire-and-forget — never throws.
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

    // Pull match_players (incl. player_id for delta lookups + display_name),
    // rounds (full tactical shape), and kill_events (for the heatmap) in
    // parallel.
    type MpRow = {
      player_id: string | null
      k: number | null
      d: number | null
      acs: number | null
      player: { display_name: string } | null
    }
    type RoundRow = {
      round_num: number | null
      side: string | null
      outcome: string | null
      round_type: string | null
      site: string | null
      plant_time_in_round: number | null
      defuse_time_in_round: number | null
      our_ults_used: number | null
      their_ults_used: number | null
    }
    type KillRow = {
      killer_x: number | null
      killer_y: number | null
      victim_x: number | null
      victim_y: number | null
      killer_is_ours: boolean | null
    }

    const [mpRes, rdRes, keRes] = await Promise.all([
      supabase
        .from('match_players')
        .select('player_id, k, d, acs, player:players(display_name)')
        .eq('match_id', matchUUID),
      supabase
        .from('rounds')
        .select(
          'round_num, side, outcome, round_type, site, plant_time_in_round, defuse_time_in_round, our_ults_used, their_ults_used'
        )
        .eq('match_id', matchUUID),
      supabase
        .from('kill_events')
        .select('killer_x, killer_y, victim_x, victim_y, killer_is_ours')
        .eq('match_id', matchUUID),
    ])

    const matchPlayers = (mpRes.data ?? []) as MpRow[]
    const rounds = (rdRes.data ?? []) as RoundRow[]
    const killEvents = (keRes.data ?? []) as KillRow[]

    // Comparisons — fan out in parallel.
    const matchPlayersForDelta = matchPlayers
      .filter((mp) => mp.player?.display_name)
      .map((mp) => ({
        player_id: mp.player_id,
        acs: mp.acs,
        display_name: mp.player!.display_name,
      }))

    const [streak, mapHistory, playerDeltas] = await Promise.all([
      computeStreakForMatch(supabase, teamId),
      match.map_name
        ? computeMapHistory(supabase, teamId, match.map_name, matchUUID)
        : Promise.resolve(null),
      computePlayerAcsDelta(supabase, teamId, matchPlayersForDelta, matchUUID),
    ])

    // Tactical + heatmap — heatmap can run while tactical is computing.
    const tactical = computeTacticalBreakdown(rounds as RoundForBreakdown[])
    const heatmapPng = await renderMatchHeatmapPng({
      mapName: match.map_name,
      killEvents: killEvents as HeatmapKillEvent[],
      matchIdHelldock: match.match_id_helldock,
    })

    const summary: DiscordMatchSummary = {
      matchIdHelldock: match.match_id_helldock,
      matchUrl: `${baseUrl.replace(/\/+$/, '')}/matches/${match.match_id_helldock}`,
      mapName: match.map_name,
      teamName: team.name,
      opponentName: match.opponent_name,
      ourScore: match.our_score,
      oppScore: match.opp_score,
      result: match.result as 'W' | 'L' | null,
      tactical,
      streak,
      mapHistory,
      playerDeltas: playerDeltas.length ? playerDeltas : null,
      heatmapPng,
    }

    if (heatmapPng) {
      await postMatchToDiscordMultipart(
        team.discord_webhook_url,
        summary,
        heatmapPng
      )
    } else {
      await postMatchToDiscord(team.discord_webhook_url, summary)
    }
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
