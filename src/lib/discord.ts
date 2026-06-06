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
  computeHighlights,
  type TacticalBreakdown,
  type StreakForMatch,
  type MapHistorySnapshot,
  type PlayerDelta,
  type OppScoreboardLine,
  type Highlight,
  type RoundForBreakdown,
  type RoundForHighlights,
  type MatchPlayerForHighlights,
} from '@/lib/discord-compute'
import {
  renderMatchHeatmapPng,
  type HeatmapKillEvent,
} from '@/lib/discord-heatmap'
import {
  computeReviewQueue,
  formatReviewQueueForDiscord,
  type ReviewItem,
  type ReviewQueueRound,
} from '@/lib/review-queue'
import {
  trainWinProbability,
  computeMatchWinProbabilities,
  type WPRound,
} from '@/lib/win-probability'

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

  // ── scoreboards ──
  playerDeltas: PlayerDelta[] | null
  oppScoreboard: OppScoreboardLine[] | null

  // ── highlights (multi-kills + clutches) ──
  highlights: Highlight[] | null

  // ── review queue (top 3 rounds worth a second look) ──
  reviewItems: ReviewItem[] | null

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

  const coachBrief = buildCoachBrief(s)
  if (coachBrief) {
    fields.push({
      name: 'Coach brief',
      value: coachBrief,
      inline: false,
    })
  }

  if (s.reviewItems && s.reviewItems.length) {
    fields.push({
      name: 'Review next',
      value: '```\n' + formatReviewQueueForDiscord(s.reviewItems) + '\n```',
      inline: false,
    })
  }

  const scoreFlow = formatScoreFlow(t)
  if (scoreFlow) {
    fields.push({ name: 'Score flow', value: scoreFlow, inline: false })
  }

  const sideRead = formatSideRead(t)
  if (sideRead) {
    fields.push({ name: 'Side read', value: sideRead, inline: false })
  }

  const economy = formatEconomy(t)
  if (economy) {
    fields.push({ name: 'Economy', value: economy, inline: false })
  }

  if (s.playerDeltas && s.playerDeltas.length) {
    fields.push({
      name: 'Players',
      value: '```\n' + formatScoreboardBlock(s.playerDeltas.slice(0, 5), true) + '\n```',
      inline: false,
    })
  }

  if (s.oppScoreboard && s.oppScoreboard.length >= 3) {
    fields.push({
      name: 'Opponent read',
      value: '```\n' + formatScoreboardBlock(s.oppScoreboard.slice(0, 5), false) + '\n```',
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

function buildCoachBrief(s: DiscordMatchSummary): string | null {
  const lines: string[] = []

  pushBriefLine(lines, buildSideConcern(s.tactical))
  pushBriefLine(lines, buildEconomyConcern(s.tactical))
  pushBriefLine(lines, buildMapHistoryNote(s.mapHistory))

  if (lines.length < 2) pushBriefLine(lines, buildScoreFlowNote(s.tactical))
  if (lines.length < 3) pushBriefLine(lines, buildPlayerNote(s.playerDeltas))
  if (lines.length < 3) pushBriefLine(lines, buildHighlightNote(s.highlights))

  return lines.length ? lines.slice(0, 3).map((line) => `- ${line}`).join('\n') : null
}

function pushBriefLine(lines: string[], line: string | null) {
  if (line && !lines.includes(line)) lines.push(line)
}

function buildSideConcern(t: TacticalBreakdown): string | null {
  type SideConcernCandidate = {
    label: 'Attack' | 'Defense'
    record: string
    w: number
    l: number
    total: number
  }

  const sides = [
    t.att
      ? {
          label: 'Attack',
          record: formatRecord(t.att.w, t.att.l),
          w: t.att.w,
          l: t.att.l,
          total: t.att.w + t.att.l,
        }
      : null,
    t.def
      ? {
          label: 'Defense',
          record: formatRecord(t.def.w, t.def.l),
          w: t.def.w,
          l: t.def.l,
          total: t.def.w + t.def.l,
        }
      : null,
  ].filter((side): side is SideConcernCandidate => side != null)

  const worst = sides
    .filter((side) => side.total >= 4 && side.l > side.w)
    .sort((a, b) => winPct(a.w, a.l) - winPct(b.w, b.l))[0]

  if (!worst) return null

  return worst.label === 'Attack'
    ? `Attack went ${worst.record}; review exec spacing and post-plants.`
    : `Defense went ${worst.record}; review setups, retakes, and first contact.`
}

function buildEconomyConcern(t: TacticalBreakdown): string | null {
  if (t.pistol && t.pistol.l > t.pistol.w) {
    const total = t.pistol.w + t.pistol.l
    const lead =
      total === 2 && t.pistol.l === 2
        ? 'Lost both pistols'
        : `Pistols went ${formatRecord(t.pistol.w, t.pistol.l)}`
    return `${lead}; review opening plan and conversion path.`
  }

  const worstBuy = (t.byBuyType ?? [])
    .filter((buy) => buy.type !== 'Pistol' && buy.w + buy.l >= 2 && buy.l > buy.w)
    .sort((a, b) => winPct(a.w, a.l) - winPct(b.w, b.l))[0]

  return worstBuy
    ? `${worstBuy.type} rounds went ${formatRecord(worstBuy.w, worstBuy.l)}; review economy plan.`
    : null
}

function buildMapHistoryNote(mapHistory: MapHistorySnapshot | null): string | null {
  if (!mapHistory || mapHistory.total < 2) return null

  const losses = mapHistory.total - mapHistory.wins
  const record = `${mapHistory.wins}-${losses}`
  if (mapHistory.wins < losses) {
    return `${mapHistory.mapName} is ${record} in ${mapHistory.windowLabel}; review map prep.`
  }
  if (mapHistory.wins > losses) {
    return `${mapHistory.mapName} is ${record} in ${mapHistory.windowLabel}; keep current prep.`
  }
  return `${mapHistory.mapName} is ${record} in ${mapHistory.windowLabel}; decide if it stays in pool.`
}

function buildScoreFlowNote(t: TacticalBreakdown): string | null {
  if (!t.halves) return null

  if (t.halves.h1.w > t.halves.h1.l && t.halves.h2.l > t.halves.h2.w) {
    return `Second half slipped ${formatRecord(t.halves.h2.w, t.halves.h2.l)}; review closing calls.`
  }
  if (t.halves.h1.l > t.halves.h1.w) {
    return `Slow start ${formatRecord(t.halves.h1.w, t.halves.h1.l)}; review first-half setup.`
  }
  return null
}

function buildPlayerNote(playerDeltas: PlayerDelta[] | null): string | null {
  const rows = (playerDeltas ?? []).filter((p) => p.acs != null)
  if (!rows.length) return null

  const lowDelta = rows
    .filter((p) => p.acsDelta != null && p.acsDelta <= -25)
    .sort((a, b) => (a.acsDelta ?? 0) - (b.acsDelta ?? 0))[0]
  if (lowDelta) {
    return `${lowDelta.name} was ${Math.abs(lowDelta.acsDelta ?? 0)} ACS below avg; review role comfort.`
  }

  const top = rows.slice().sort((a, b) => (b.acs ?? -1) - (a.acs ?? -1))[0]
  return top ? `${top.name} led at ${Math.round(top.acs ?? 0)} ACS; keep enabling that plan.` : null
}

function buildHighlightNote(highlights: Highlight[] | null): string | null {
  const clutch = (highlights ?? []).find((h) => h.kind === 'clutch')
  if (clutch && clutch.kind === 'clutch') {
    return `Key swing: ${clutch.player} ${clutch.clutchType} clutch R${clutch.round}.`
  }

  const multi = (highlights ?? [])[0]
  if (!multi || multi.kind === 'clutch') return null

  const label =
    multi.kind === 'ace'
      ? 'ace'
      : multi.kind === 'four_k'
      ? '4K'
      : '3K'
  return `Key swing: ${multi.player} ${multi.count > 1 ? `${multi.count}x ` : ''}${label}.`
}

function formatScoreFlow(t: TacticalBreakdown): string | null {
  const parts: string[] = []
  if (t.halves) {
    parts.push(`H1 ${formatRecord(t.halves.h1.w, t.halves.h1.l)}`)
    parts.push(`H2 ${formatRecord(t.halves.h2.w, t.halves.h2.l)}`)
    if (t.halves.ot) parts.push(`OT ${formatRecord(t.halves.ot.w, t.halves.ot.l)}`)
  }
  if (t.pistol) parts.push(`Pistols ${formatRecord(t.pistol.w, t.pistol.l)}`)
  return parts.length ? parts.join(' | ') : null
}

function formatSideRead(t: TacticalBreakdown): string | null {
  const lines: string[] = []
  if (t.att) {
    const parts = [`Attack ${formatRecord(t.att.w, t.att.l)}`]
    if (t.att.plantRatePct != null) parts.push(`plant ${t.att.plantRatePct}%`)
    if (t.att.avgPlantSec != null) parts.push(`avg plant ${t.att.avgPlantSec}s`)
    lines.push(parts.join(', '))
  }
  if (t.def) {
    const parts = [`Defense ${formatRecord(t.def.w, t.def.l)}`]
    if (t.def.defuseRatePct != null) parts.push(`defuse ${t.def.defuseRatePct}%`)
    if (t.def.avgDefuseSec != null) parts.push(`avg defuse ${t.def.avgDefuseSec}s`)
    lines.push(parts.join(', '))
  }

  const siteLine = formatSites(t.sites)
  if (siteLine) lines.push(`Sites: ${siteLine}`)

  return lines.length ? lines.join('\n') : null
}

function formatEconomy(t: TacticalBreakdown): string | null {
  if (!t.byBuyType?.length) return null
  return t.byBuyType
    .map((buy) => `${buy.type} ${formatRecord(buy.w, buy.l)}`)
    .join(' | ')
}

function formatSites(sites: TacticalBreakdown['sites']): string | null {
  if (!sites) return null

  const parts: string[] = []
  for (const site of ['A', 'B', 'C'] as const) {
    const row = sites[site]
    if (row.total <= 0) continue
    const pct = Math.round((row.wins / row.total) * 100)
    parts.push(`${site} ${row.wins}/${row.total} (${pct}%)`)
  }
  return parts.length ? parts.join(' | ') : null
}

function formatRecord(wins: number, losses: number): string {
  return `${wins}-${losses}`
}

function winPct(wins: number, losses: number): number {
  const total = wins + losses
  return total > 0 ? wins / total : 0
}

type ScoreboardLine = {
  name: string
  k: number | null
  a: number | null
  d: number | null
  acs: number | null
  acsDelta?: number | null
}

function formatScoreboardBlock(rows: ScoreboardLine[], withDelta: boolean): string {
  const maxName = Math.max(...rows.map((r) => r.name.length))
  return rows
    .map((r) => {
      const name = r.name.padEnd(maxName)
      const kad = formatKad(r.k, r.a, r.d).padEnd(8)
      const acs = r.acs != null ? String(Math.round(r.acs)).padStart(4) : '   —'
      let delta = ''
      if (withDelta) {
        if (r.acsDelta != null) {
          const sign = r.acsDelta > 0 ? '+' : r.acsDelta < 0 ? '−' : '±'
          const abs = Math.abs(r.acsDelta)
          delta = `  (${sign}${String(abs).padStart(2)})`
        } else {
          delta = '       '
        }
      }
      return `${name}  ${kad}${acs}${delta}`
    })
    .join('\n')
}

function formatKad(
  k: number | null,
  a: number | null,
  d: number | null
): string {
  const fmt = (n: number | null) => (n == null ? '—' : String(n))
  return `${fmt(k)}/${fmt(a)}/${fmt(d)}`
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
    // payload_json must be a plain string field, NOT a Blob — wrapping it in
    // a Blob makes FormData send it as a file attachment, which Discord then
    // shows as a separate "blob" file instead of parsing it as the embed.
    form.append('payload_json', JSON.stringify(buildMatchEmbed(summary)))
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

// ── Review queue compute (Discord-side wrapper) ──────────────────────────────

type ReviewRoundRow = {
  round_num: number | null
  side: string | null
  outcome: string | null
  round_type: string | null
  our_econ: number | null
  their_econ: number | null
  first_blood: string | null
  clutch_type: string | null
  clutch_player: string | null
  coach_grade: number | null
  coach_tags: string[] | null
}

/**
 * Train a one-shot WP model on the team's historical rounds and run the
 * review-queue compute against the just-inserted match. Returns top 3 for
 * the Discord field (in-app surface uses top 5). Failures swallow to [].
 */
async function computeMatchReviewItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  teamId: string,
  matchUUID: string,
  rounds: ReviewRoundRow[]
): Promise<ReviewItem[]> {
  try {
    // Pull the team's full historical rounds for WP training. Small payload
    // (~500 rows × 7 cols) and the training itself is sub-50ms per the WP
    // model's own perf note.
    const { data: hist } = await supabase
      .from('rounds')
      .select('match_id, round_num, side, outcome, round_type, our_econ, their_econ, match:matches!inner(team_id, deleted_at)')
      .eq('match.team_id', teamId)
      .is('match.deleted_at', null)
    type HistRow = {
      match_id: string
      round_num: number
      side: string | null
      outcome: string | null
      round_type: string | null
      our_econ: number | null
      their_econ: number | null
    }
    const wpHistorical: WPRound[] = ((hist ?? []) as HistRow[]).map((r) => ({
      match_id: r.match_id,
      round_num: r.round_num,
      side: r.side,
      outcome: r.outcome,
      round_type: r.round_type,
      our_econ: r.our_econ,
      their_econ: r.their_econ,
    }))
    const wpModel = trainWinProbability(wpHistorical)

    // Map the just-inserted match's rounds onto the queue input shape.
    // Drop null round_num rows (extremely rare; manual-entry placeholder).
    const queueRounds: ReviewQueueRound[] = rounds
      .filter((r): r is ReviewRoundRow & { round_num: number } => r.round_num != null)
      .map((r) => ({
        round_num: r.round_num,
        side: r.side,
        outcome: r.outcome,
        round_type: r.round_type,
        our_econ: r.our_econ,
        their_econ: r.their_econ,
        first_blood: r.first_blood,
        clutch_type: r.clutch_type,
        clutch_player: r.clutch_player,
        coach_grade: r.coach_grade,
        coach_tags: r.coach_tags,
      }))

    return computeReviewQueue({
      rounds: queueRounds,
      wpWeights: wpModel?.weights ?? null,
      topN: 3,
    })
  } catch (e) {
    console.warn(
      `[discord] review-queue compute failed: ${e instanceof Error ? e.message : String(e)}`
    )
    // Side-effects in the catch path are fine for Discord — match insert is
    // already committed; this is best-effort enrichment of the recap.
    void matchUUID // unused-but-typed
    return []
  }
}

// ── notifyDiscordForMatch ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = SupabaseClient | any

async function recordDiscordFailure(
  supabase: SupabaseLike,
  matchUUID: string,
  matchIdHelldock: string | null,
  henrikId: string | null,
  error: string,
  payload?: Record<string, unknown>
) {
  try {
    await supabase.from('ingest_failures').insert({
      match_id: matchUUID,
      match_id_helldock: matchIdHelldock,
      henrik_id: henrikId,
      source: 'discord',
      error: error.slice(0, 1000),
      payload,
    })
  } catch {
    // ignore — best effort
  }
}

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
  let matchIdHelldock: string | null = null
  let henrikId: string | null = null

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
        'match_id_helldock, henrik_id, map_name, opponent_name, our_score, opp_score, result'
      )
      .eq('id', matchUUID)
      .single()
    if (!match) return
    matchIdHelldock = match.match_id_helldock
    henrikId = match.henrik_id

    // Pull match_players (incl. player_id for delta lookups + display_name),
    // rounds (full tactical shape), and kill_events (for the heatmap) in
    // parallel.
    type MpRow = {
      player_id: string | null
      k: number | null
      a: number | null
      d: number | null
      acs: number | null
      riot_name: string | null
      two_k: number | null
      three_k: number | null
      four_k: number | null
      aces: number | null
      player: { display_name: string } | null
    }
    type OppRow = {
      opp_player_name: string | null
      riot_id_full: string | null
      k: number | null
      a: number | null
      d: number | null
      acs: number | null
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
      clutch_type: string | null
      clutch_player: string | null
      first_blood: string | null
      our_econ: number | null
      their_econ: number | null
      coach_grade: number | null
      coach_tags: string[] | null
    }
    type KillRow = {
      killer_x: number | null
      killer_y: number | null
      victim_x: number | null
      victim_y: number | null
      killer_is_ours: boolean | null
    }

    const [mpRes, rdRes, keRes, oppRes] = await Promise.all([
      supabase
        .from('match_players')
        .select(
          'player_id, k, a, d, acs, riot_name, two_k, three_k, four_k, aces, player:players(display_name)'
        )
        .eq('match_id', matchUUID),
      supabase
        .from('rounds')
        .select(
          'round_num, side, outcome, round_type, site, plant_time_in_round, defuse_time_in_round, our_ults_used, their_ults_used, clutch_type, clutch_player, first_blood, our_econ, their_econ, coach_grade, coach_tags'
        )
        .eq('match_id', matchUUID),
      supabase
        .from('kill_events')
        .select('killer_x, killer_y, victim_x, victim_y, killer_is_ours')
        .eq('match_id', matchUUID),
      supabase
        .from('opp_players')
        .select('opp_player_name, riot_id_full, k, a, d, acs')
        .eq('match_id', matchUUID),
    ])

    const matchPlayers = (mpRes.data ?? []) as MpRow[]
    const rounds = (rdRes.data ?? []) as RoundRow[]
    const killEvents = (keRes.data ?? []) as KillRow[]
    const oppRows = (oppRes.data ?? []) as OppRow[]

    // Opp scoreboard — keep rows that have at least one of k/d/acs populated
    // so manual matches with empty opp rows don't render an empty block.
    const oppScoreboard: OppScoreboardLine[] = oppRows
      .filter((o) => o.k != null || o.d != null || o.acs != null)
      .map((o) => ({
        name: o.opp_player_name ?? o.riot_id_full ?? '???',
        k: o.k,
        a: o.a,
        d: o.d,
        acs: o.acs,
      }))
      .sort((a, b) => (b.acs ?? -1) - (a.acs ?? -1))

    // Comparisons — fan out in parallel.
    const matchPlayersForDelta = matchPlayers
      .filter((mp) => mp.player?.display_name)
      .map((mp) => ({
        player_id: mp.player_id,
        k: mp.k,
        a: mp.a,
        d: mp.d,
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

    // Tactical breakdown + highlights — pure compute over already-fetched rows.
    const tactical = computeTacticalBreakdown(rounds as RoundForBreakdown[])
    const matchPlayersForHighlights: MatchPlayerForHighlights[] = matchPlayers
      .filter((mp) => mp.player?.display_name)
      .map((mp) => ({
        display_name: mp.player!.display_name,
        riot_name: mp.riot_name,
        two_k: mp.two_k,
        three_k: mp.three_k,
        four_k: mp.four_k,
        aces: mp.aces,
      }))
    // S26 — Build per-round WP-leverage map so clutch ranking accounts for
    // round difficulty (1v3 in 5%-WP eco > 1v3 in 95%-WP full-buy). Best-effort:
    // if WP fails to train, computeHighlights falls back to base ranking.
    let wpLeverageByRound: Record<number, number> | undefined
    try {
      const { data: histRounds } = await supabase
        .from('rounds')
        .select(
          'match_id, round_num, side, outcome, round_type, our_econ, their_econ, match:matches!inner(team_id, deleted_at)'
        )
        .eq('match.team_id', teamId)
        .is('match.deleted_at', null)
      const histTyped = (histRounds ?? []) as Array<{
        match_id: string
        round_num: number
        side: string | null
        outcome: string | null
        round_type: string | null
        our_econ: number | null
        their_econ: number | null
      }>
      const wpHist: WPRound[] = histTyped.map((r) => ({
        match_id: r.match_id,
        round_num: r.round_num,
        side: r.side,
        outcome: r.outcome,
        round_type: r.round_type,
        our_econ: r.our_econ,
        their_econ: r.their_econ,
      }))
      const wpModel = trainWinProbability(wpHist)
      if (wpModel) {
        const thisMatchWp = computeMatchWinProbabilities(
          wpModel.weights,
          rounds
            .filter((r): r is RoundRow & { round_num: number } => r.round_num != null)
            .map((r) => ({
              match_id: matchUUID,
              round_num: r.round_num as number,
              side: r.side,
              outcome: r.outcome,
              round_type: r.round_type,
              our_econ: r.our_econ,
              their_econ: r.their_econ,
            }))
        )
        wpLeverageByRound = {}
        for (const row of thisMatchWp) {
          if (row.outcome !== 'W' && row.outcome !== 'L') continue
          wpLeverageByRound[row.round_num] =
            row.outcome === 'W' ? 1 - row.wpPct / 100 : row.wpPct / 100
        }
      }
    } catch {
      // best-effort — skip leverage on any failure
    }

    const highlights = computeHighlights(
      matchPlayersForHighlights,
      rounds as RoundForHighlights[],
      wpLeverageByRound
    )

    const heatmapPng = await renderMatchHeatmapPng({
      mapName: match.map_name,
      killEvents: killEvents as HeatmapKillEvent[],
      mode: 'dots',
    })

    // Review queue — trains a one-shot WP model from the team's historical
    // rounds, then ranks the just-inserted match's rounds by review-relevance.
    // Discord field shows the top 3. Failures here are non-fatal — the recap
    // still posts without the queue.
    const reviewItems = await computeMatchReviewItems(
      supabase,
      teamId,
      matchUUID,
      rounds
    )

    const summary: DiscordMatchSummary = {
      matchIdHelldock: match.match_id_helldock,
      matchUrl: `${baseUrl.replace(/\/+$/, '')}/app/matches/${match.match_id_helldock}`,
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
      oppScoreboard: oppScoreboard.length ? oppScoreboard : null,
      highlights: highlights.length ? highlights : null,
      reviewItems: reviewItems.length ? reviewItems : null,
      heatmapPng,
    }

    const postResult = heatmapPng
      ? await postMatchToDiscordMultipart(
          team.discord_webhook_url,
          summary,
          heatmapPng
        )
      : await postMatchToDiscord(team.discord_webhook_url, summary)

    if (!postResult.ok) {
      await recordDiscordFailure(
        supabase,
        matchUUID,
        match.match_id_helldock,
        match.henrik_id,
        postResult.error ?? `Discord responded ${postResult.status ?? 'unknown'}`,
        {
          status: postResult.status ?? null,
          withHeatmap: Boolean(heatmapPng),
        }
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[discord] notify failed: ${msg}`)
    // Persist so the failure shows up on the Home page badge instead of
    // disappearing into the void.
    await recordDiscordFailure(supabase, matchUUID, matchIdHelldock, henrikId, msg)
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
